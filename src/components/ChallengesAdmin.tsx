import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  deleteDoc,
  getDocs,
  where,
  writeBatch,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { createNotification } from "../lib/notificationUtils";
import { Challenge, Team, ScheduleMatch, MatchResultType } from "../types";
import { recordMatchResult } from "../lib/utils";
import {
  Swords,
  Trash,
  Check,
  X,
  Shield,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

export default function ChallengesAdmin() {
  const { settings } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scheduledChallenges, setScheduledChallenges] = useState<
    ScheduleMatch[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Result reporting state
  const [reportingMatch, setReportingMatch] = useState<ScheduleMatch | null>(
    null,
  );
  const [reportData, setReportData] = useState({
    winnerId: "",
    type: "win" as MatchResultType,
    pointsA: 0,
    pointsB: 0,
    diamondsA: 0,
    diamondsB: 0,
    useManual: false,
  });
  const [isReporting, setIsReporting] = useState(false);
  const [cancelingMatch, setCancelingMatch] = useState<ScheduleMatch | null>(null);

  useEffect(() => {
    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Team));
    });

    const unsubChallenges = onSnapshot(collection(db, "challenges"), (snap) => {
      setChallenges(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Challenge),
      );
      setLoading(false);
    });

    const challengeSchedulesQuery = query(
      collection(db, "schedules"),
      where("matchType", "==", "challenge"),
      where("status", "!=", "completed"),
    );
    const unsubSchedules = onSnapshot(challengeSchedulesQuery, (snap) => {
      setScheduledChallenges(
        snap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as ScheduleMatch,
        ),
      );
    });

    return () => {
      unsubTeams();
      unsubChallenges();
      unsubSchedules();
    };
  }, []);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingMatch) return;
    if (!reportData.winnerId && reportData.type !== "rematch") {
      toast.error("Please select a winner or result type");
      return;
    }

    setIsReporting(true);
    try {
      const manualPoints = reportData.useManual
        ? { teamA: reportData.pointsA, teamB: reportData.pointsB }
        : undefined;
      const manualDiamonds = reportData.useManual
        ? { teamA: reportData.diamondsA, teamB: reportData.diamondsB }
        : undefined;

      const results = await recordMatchResult(
        reportingMatch.team1Id || "",
        reportingMatch.team2Id || "",
        reportData.winnerId as any,
        reportData.type,
        manualPoints,
        manualDiamonds,
        true,
        Number(reportingMatch.bet || 0),
      );

      await updateDoc(doc(db, "schedules", reportingMatch.id), {
        status: "completed",
        matchDetails: {
          winnerId: reportData.winnerId,
          resultType: reportData.type,
          pointsExchanged: {
            team1: results.pointsExchanged.teamA,
            team2: results.pointsExchanged.teamB,
          },
          diamondsExchanged: {
            team1: results.diamondsExchanged.teamA,
            team2: results.diamondsExchanged.teamB,
          },
        },
      });

      toast.success("Challenge result reported!");
      setReportingMatch(null);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to report: " + err.message);
    } finally {
      setIsReporting(false);
    }
  };

  const handleForceAccept = async (
    challenge: Challenge,
    targetTeamId: string,
  ) => {
    if (processingId) return;
    setProcessingId(`${challenge.id}-${targetTeamId}`);

    const fromTeam = teams.find((t) => t.id === challenge.fromTeamId);
    const targetTeam = teams.find((t) => t.id === targetTeamId);
    const details = challenge.challengeDetails?.[targetTeamId];

    if (!fromTeam || !targetTeam || !details) {
      toast.error("Missing match data");
      setProcessingId(null);
      return;
    }

    // Count confirmed challenge matches for this season
    const limit = settings?.challengeLimitPerUser || 7;

    const getMatchCount = async (teamId: string) => {
      const q1 = query(
        collection(db, "schedules"),
        where("team1Id", "==", teamId),
        where("matchType", "==", "challenge"),
        where("status", "!=", "cancelled"),
      );
      const q2 = query(
        collection(db, "schedules"),
        where("team2Id", "==", teamId),
        where("matchType", "==", "challenge"),
        where("status", "!=", "cancelled"),
      );
      const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      return s1.size + s2.size;
    };

    try {
      const [fromMatches, targetMatches] = await Promise.all([
        getMatchCount(fromTeam.id),
        getMatchCount(targetTeam.id),
      ]);

      if (fromMatches >= limit) {
        toast.error(`${fromTeam.teamName} has reached match limit (${limit}).`);
        setProcessingId(null);
        return;
      }

      if (targetMatches >= limit) {
        toast.error(
          `${targetTeam.teamName} has reached match limit (${limit}).`,
        );
        setProcessingId(null);
        return;
      }

      // Check for existing schedule between these two in this season
      const qPair1 = query(
        collection(db, "schedules"),
        where("team1Id", "==", fromTeam.id),
        where("team2Id", "==", targetTeam.id),
        where("matchType", "==", "challenge"),
        where("status", "!=", "cancelled"),
      );
      const qPair2 = query(
        collection(db, "schedules"),
        where("team1Id", "==", targetTeam.id),
        where("team2Id", "==", fromTeam.id),
        where("matchType", "==", "challenge"),
        where("status", "!=", "cancelled"),
      );
      const [pairSnap1, pairSnap2] = await Promise.all([
        getDocs(qPair1),
        getDocs(qPair2),
      ]);

      if (!pairSnap1.empty || !pairSnap2.empty) {
        toast.error(
          "These teams have already played or have a scheduled match against each other this season.",
        );
        setProcessingId(null);
        return;
      }

      const batch = writeBatch(db);

      // 1. Create Schedule
      const scheduleRef = doc(collection(db, "schedules"));
      batch.set(scheduleRef, {
        team1Id: fromTeam.id,
        team1Name: fromTeam.teamName,
        team2Id: targetTeam.id,
        team2Name: targetTeam.teamName,
        date: details.date,
        time: details.time,
        matchType: "challenge",
        status: "upcoming",
        firstPick: details.sideSelection || "1st",
        bet: details.bet || 0,
        createdAt: serverTimestamp(),
      });

      // 2. Increment Counts
      batch.update(doc(db, "teams", fromTeam.id), {
        matchesThisSeason: (fromTeam.matchesThisSeason || 0) + 1,
      });
      batch.update(doc(db, "teams", targetTeam.id), {
        matchesThisSeason: (targetTeam.matchesThisSeason || 0) + 1,
      });

      // 3. Remove Challenge Entry for this target
      const newTargets = (challenge.targetTeamIds || []).filter(
        (id) => id !== targetTeamId,
      );
      if (newTargets.length === 0) {
        batch.delete(doc(db, "challenges", challenge.id));
      } else {
        const newDetails = { ...challenge.challengeDetails };
        delete newDetails[targetTeamId];

        // Sanitize
        Object.keys(newDetails).forEach((key) => {
          const d = newDetails[key] as any;
          if (d && d.sideSelection === undefined) {
            delete d.sideSelection;
          }
        });

        batch.update(doc(db, "challenges", challenge.id), {
          targetTeamIds: newTargets,
          challengeDetails: newDetails,
        });
      }

      await batch.commit();
      toast.success("Match forced into schedule!");

      // Notify teams
      if (fromTeam.ownerId) {
        await createNotification(
          fromTeam.ownerId,
          "Admin: Match Forced",
          `An admin has officially scheduled your match against ${targetTeam.teamName}. Check the schedule!`,
          "system",
          "/schedule",
        );
      }
      if (targetTeam.ownerId) {
        await createNotification(
          targetTeam.ownerId,
          "Admin: Match Forced",
          `An admin has officially scheduled your match against ${fromTeam.teamName}. Check the schedule!`,
          "system",
          "/schedule",
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to approve challenge.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteChallenge = async (
    challenge: Challenge,
    targetTeamId?: string,
  ) => {
    try {
      if (targetTeamId) {
        const newTargets = (challenge.targetTeamIds || []).filter(
          (id) => id !== targetTeamId,
        );
        if (newTargets.length === 0) {
          await deleteDoc(doc(db, "challenges", challenge.id));
        } else {
          const newDetails = { ...challenge.challengeDetails };
          delete newDetails[targetTeamId];

          Object.keys(newDetails).forEach((key) => {
            const d = newDetails[key] as any;
            if (d && d.sideSelection === undefined) {
              delete d.sideSelection;
            }
          });

          await updateDoc(doc(db, "challenges", challenge.id), {
            targetTeamIds: newTargets,
            challengeDetails: newDetails,
          });
        }
      } else {
        await deleteDoc(doc(db, "challenges", challenge.id));
      }
      toast.success("Challenge deleted.");

      const fromTeam = teams.find((t) => t.id === challenge.fromTeamId);
      if (fromTeam?.ownerId) {
        const targetTeam = targetTeamId
          ? teams.find((t) => t.id === targetTeamId)
          : null;
        await createNotification(
          fromTeam.ownerId,
          "Challenge Removed",
          `An admin has cancelled your challenge ${targetTeam ? `targeting ${targetTeam.teamName}` : "completely"}.`,
          "system",
          "/challenges",
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Delete failed.");
    }
  };

  const handleCancelMatch = async (match: ScheduleMatch) => {
    setProcessingId(match.id);
    try {
      const batch = writeBatch(db);

      // 1. Mark schedule as cancelled
      batch.update(doc(db, "schedules", match.id), {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });

      // 2. Decrement matchesThisSeason count for both teams
      const team1 = teams.find((t) => t.id === match.team1Id);
      const team2 = teams.find((t) => t.id === match.team2Id);

      if (team1) {
        batch.update(doc(db, "teams", team1.id), {
          matchesThisSeason: Math.max(0, (team1.matchesThisSeason || 0) - 1),
        });
      }
      if (team2) {
        batch.update(doc(db, "teams", team2.id), {
          matchesThisSeason: Math.max(0, (team2.matchesThisSeason || 0) - 1),
        });
      }

      await batch.commit();

      // 3. Notify team leaders
      if (team1?.ownerId) {
        await createNotification(
          team1.ownerId,
          "Match Cancelled by Admin",
          `Your scheduled match against ${match.team2Name} has been cancelled by an administrator. Your match limit count was restored.`,
          "system",
          "/schedule",
        );
      }
      if (team2?.ownerId) {
        await createNotification(
          team2.ownerId,
          "Match Cancelled by Admin",
          `Your scheduled match against ${match.team1Name} has been cancelled by an administrator. Your match limit count was restored.`,
          "system",
          "/schedule",
        );
      }

      toast.success("Match cancelled successfully.");
      setCancelingMatch(null);
    } catch (err: any) {
      console.error(err);
      toast.error(
        "Failed to cancel match: " + (err.message || "Unknown error"),
      );
    } finally {
      setProcessingId(null);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-20">
        <Loader2 size={40} className="animate-spin text-neon-blue" />
      </div>
    );

  return (
    <div className="space-y-12">
      {/* Result Reporting Modal */}
      <AnimatePresence>
        {cancelingMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="glass-card p-6 max-w-sm w-full relative overflow-hidden text-center"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-neon-red"></div>
              <X size={40} className="text-neon-red mx-auto mb-4" />
              <h3 className="text-lg font-black uppercase text-white mb-2">Cancel Match</h3>
              <p className="text-xs text-gray-400 mb-6">
                Are you sure you want to cancel the match between <span className="text-white font-bold">{cancelingMatch.team1Name}</span> and <span className="text-white font-bold">{cancelingMatch.team2Name}</span>? This will set its status to cancelled and restore match limits.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCancelingMatch(null)}
                  disabled={processingId === cancelingMatch.id}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-black uppercase rounded-lg transition-all"
                >
                  Keep
                </button>
                <button
                  onClick={() => handleCancelMatch(cancelingMatch)}
                  disabled={processingId === cancelingMatch.id}
                  className="px-4 py-2 bg-neon-red hover:bg-[#ff0033] text-white text-xs font-black uppercase rounded-lg transition-all shadow-[0_0_15px_rgba(255,0,85,0.4)] disabled:opacity-50"
                >
                  {processingId === cancelingMatch.id ? "Canceling..." : "Confirm Cancel"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {reportingMatch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="glass-card p-6 max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-neon-blue via-neon-cyan to-neon-blue"></div>

              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black uppercase text-neon-blue">
                  Report Challenge Result
                </h3>
                <button
                  onClick={() => setReportingMatch(null)}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div className="bg-black/40 p-4 rounded-xl border border-white/10 text-center mb-4">
                  <div className="flex items-center justify-center gap-4 text-sm font-black">
                    <span className="text-neon-blue">
                      {reportingMatch.team1Name}
                    </span>
                    <span className="text-[10px] text-gray-500 italic">VS</span>
                    <span className="text-neon-blue">
                      {reportingMatch.team2Name}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    {reportingMatch.date} @ {reportingMatch.time}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 font-bold uppercase block">
                    Result Type
                  </label>
                  <select
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
                    value={reportData.type}
                    onChange={(e) =>
                      setReportData({
                        ...reportData,
                        type: e.target.value as MatchResultType,
                        winnerId:
                          e.target.value === "rematch"
                            ? ""
                            : reportData.winnerId,
                      })
                    }
                  >
                    <option value="win">Win / Loss</option>
                    <option value="walkout">Walkout (Penalty)</option>
                    <option value="rematch">Rematch (No points)</option>
                  </select>
                </div>

                {reportData.type !== "rematch" && (
                  <div className="space-y-2">
                    <label className="text-[10px] text-gray-500 font-bold uppercase block">
                      {reportData.type === "walkout"
                        ? "Who Walked Out?"
                        : "Winner"}
                    </label>
                    <select
                      className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm"
                      value={reportData.winnerId}
                      onChange={(e) => {
                        const winId = e.target.value;
                        if (reportingMatch.bet) {
                          const bet = Number(reportingMatch.bet);
                          setReportData({
                            ...reportData,
                            winnerId: winId,
                            diamondsA:
                              winId === reportingMatch.team1Id
                                ? bet
                                : winId === reportingMatch.team2Id
                                  ? -bet
                                  : 0,
                            diamondsB:
                              winId === reportingMatch.team2Id
                                ? bet
                                : winId === reportingMatch.team1Id
                                  ? -bet
                                  : 0,
                          });
                        } else {
                          setReportData({ ...reportData, winnerId: winId });
                        }
                      }}
                      required
                    >
                      <option value="">Select Team</option>
                      <option value={reportingMatch.team1Id}>
                        {reportingMatch.team1Name}
                      </option>
                      <option value={reportingMatch.team2Id}>
                        {reportingMatch.team2Name}
                      </option>
                    </select>
                  </div>
                )}

                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-gray-500 font-bold uppercase">
                      Reward/Penalty Override
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={reportData.useManual}
                        onChange={(e) =>
                          setReportData({
                            ...reportData,
                            useManual: e.target.checked,
                          })
                        }
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:width-4 after:transition-all peer-checked:bg-neon-blue"></div>
                      <span className="ml-2 text-[10px] font-black uppercase text-gray-400">
                        Manual
                      </span>
                    </label>
                  </div>

                  {reportData.useManual && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="grid grid-cols-2 gap-4 bg-black/30 p-4 rounded-xl border border-white/5"
                    >
                      <div className="space-y-2">
                        <label className="text-[10px] text-neon-blue font-bold uppercase truncate">
                          {reportingMatch.team1Name}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Pts"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs"
                            value={reportData.pointsA}
                            onChange={(e) =>
                              setReportData({
                                ...reportData,
                                pointsA: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                          <input
                            type="number"
                            placeholder="Dia"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs"
                            value={reportData.diamondsA}
                            onChange={(e) =>
                              setReportData({
                                ...reportData,
                                diamondsA: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-neon-blue font-bold uppercase truncate text-right block">
                          {reportingMatch.team2Name}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Pts"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs text-right"
                            value={reportData.pointsB}
                            onChange={(e) =>
                              setReportData({
                                ...reportData,
                                pointsB: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                          <input
                            type="number"
                            placeholder="Dia"
                            className="w-full bg-black/50 border border-white/10 rounded p-1 text-xs text-right"
                            value={reportData.diamondsB}
                            onChange={(e) =>
                              setReportData({
                                ...reportData,
                                diamondsB: parseInt(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setReportingMatch(null)}
                    className="flex-1 bg-white/5 hover:bg-white/10 p-3 rounded-xl font-bold uppercase text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isReporting}
                    className="flex-1 bg-neon-blue text-black p-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2"
                  >
                    {isReporting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Submit Report
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {(() => {
          const activeScheduledChallenges = scheduledChallenges.filter(
            (s) => s.status !== "cancelled",
          );

          return (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase text-neon-blue flex items-center gap-2">
                  <ShieldCheck size={20} /> Challenge Results Pending
                </h2>
                <div className="text-[10px] font-black uppercase text-gray-500 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                  {activeScheduledChallenges.length} SCHEDULED
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {activeScheduledChallenges.map((s) => {
                  const [year, month, day] = s.date.split("-").map(Number);
                  const [hour, minute] = s.time.split(":").map(Number);
                  const matchDate = new Date(year, month - 1, day, hour, minute);
                  const isUpcoming = Date.now() < matchDate.getTime();

                  return (
                    <div
                      key={s.id}
                      className="glass-card p-4 flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10 hover:border-neon-blue/30 transition-all"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5 flex-1 justify-center">
                          <span className="font-black text-xs uppercase truncate max-w-[120px]">
                            {s.team1Name}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-gray-600 italic">
                          VS
                        </span>
                        <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5 flex-1 justify-center">
                          <span className="font-black text-xs uppercase truncate max-w-[120px]">
                            {s.team2Name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-8 px-6 border-x border-white/5">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                            Schedule
                          </p>
                          <p className="text-[10px] font-bold text-white uppercase">
                            {s.date} @ {s.time}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                            Bet
                          </p>
                          <p className="text-[10px] font-black text-neon-cyan uppercase">
                            {s.bet || 0} DIA
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                            Status
                          </p>
                          {isUpcoming ? (
                            <span className="px-2.5 py-1 text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded uppercase tracking-wider">
                              Upcoming
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded uppercase tracking-wider">
                              Ended
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isUpcoming ? (
                          <button
                            onClick={() => setCancelingMatch(s)}
                            className="px-4 py-2 bg-neon-red/10 border border-neon-red/30 hover:bg-neon-red text-neon-red hover:text-white font-black uppercase text-[10px] rounded-lg transition-all active:scale-95 flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,0,85,0.15)]"
                          >
                            <X size={12} />
                            Cancel Match
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setReportingMatch(s);
                              setReportData({
                                winnerId: "",
                                type: "win",
                                pointsA: 0,
                                pointsB: 0,
                                diamondsA: 0,
                                diamondsB: 0,
                                useManual: false,
                              });
                            }}
                            className="px-6 py-2 bg-neon-blue text-black font-black uppercase text-[10px] rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(0,229,255,0.2)]"
                          >
                            Pending (Result)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {activeScheduledChallenges.length === 0 && (
                  <div className="text-center py-10 bg-white/5 border border-white/5 rounded-3xl">
                    <p className="text-gray-600 font-bold uppercase tracking-widest text-[10px] italic">
                      No pending challenge results.
                    </p>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black uppercase text-neon-blue flex items-center gap-2">
            <Swords size={20} /> Incoming Requests
          </h2>
          <div className="text-[10px] font-black uppercase text-gray-500 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
            {challenges.reduce(
              (acc, c) => acc + (c.targetTeamIds || []).length,
              0,
            )}{" "}
            TOTAL REQUESTS
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {challenges.map((c) => {
            const fromTeam = teams.find((t) => t.id === c.fromTeamId);
            return (c.targetTeamIds || []).map((targetId) => {
              const targetTeam = teams.find((t) => t.id === targetId);
              const details = c.challengeDetails?.[targetId];
              const isProcessing = processingId === `${c.id}-${targetId}`;

              return (
                <div
                  key={`${c.id}-${targetId}`}
                  className="glass-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-white/20 transition-all border border-white/10"
                >
                  <div className="flex items-center gap-6 flex-1">
                    <div className="text-center">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">
                        Challenger
                      </p>
                      <div className="flex items-center gap-3 bg-neon-blue/5 border border-neon-blue/20 rounded-xl p-3 min-w-[160px]">
                        <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center border border-white/10 overflow-hidden">
                          {fromTeam?.logoUrl ? (
                            <img
                              src={fromTeam.logoUrl}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <Shield size={16} />
                          )}
                        </div>
                        <span className="font-black text-xs uppercase truncate">
                          {fromTeam?.teamName || "Unknown"}
                        </span>
                      </div>
                    </div>

                    <Swords size={20} className="text-gray-600 shrink-0 mt-4" />

                    <div className="text-center">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">
                        Target
                      </p>
                      <div className="flex items-center gap-3 bg-neon-red/5 border border-neon-red/20 rounded-xl p-3 min-w-[160px]">
                        <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center border border-white/10 overflow-hidden">
                          {targetTeam?.logoUrl ? (
                            <img
                              src={targetTeam.logoUrl}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <Shield size={16} />
                          )}
                        </div>
                        <span className="font-black text-xs uppercase truncate">
                          {targetTeam?.teamName || "Unknown"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:grid grid-cols-2 gap-4 px-6 border-x border-white/5">
                    <div>
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                        Proposed Slot
                      </p>
                      <p className="text-[10px] font-bold text-white uppercase">
                        {details?.date} @ {details?.time}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">
                        Stakes
                      </p>
                      <p className="text-[10px] font-black text-neon-cyan uppercase">
                        {details?.bet || 0} Diamonds
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      disabled={isProcessing}
                      onClick={() => handleForceAccept(c, targetId)}
                      className="p-3 bg-neon-green/10 text-neon-green border border-neon-green/30 rounded-xl hover:bg-neon-green/20 transition-all"
                      title="Force Approve"
                    >
                      {isProcessing ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Check size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteChallenge(c, targetId)}
                      className="p-3 bg-neon-red/10 text-neon-red border border-neon-red/30 rounded-xl hover:bg-neon-red/20 transition-all"
                      title="Reject/Delete"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              );
            });
          })}

          {challenges.length === 0 && (
            <div className="text-center py-20 bg-white/5 border border-white/5 rounded-3xl space-y-4">
              <Swords size={48} className="mx-auto text-gray-800" />
              <p className="text-gray-600 font-bold uppercase tracking-widest text-xs italic">
                Terminal clear. No active challenge requests detected.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
