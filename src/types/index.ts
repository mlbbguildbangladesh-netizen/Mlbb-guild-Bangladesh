export type Role = 'admin' | 'team';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type MatchResultType = 'win' | 'loss' | 'walkout' | 'rematch' | 'cancelled';
export type TransactionType = 'win' | 'loss' | 'bonus' | 'shop' | 'penalty' | 'expense';

export interface FormFieldSetting {
  id: string;
  label: string;
  type: 'text' | 'image' | 'url' | 'number' | 'email' | 'file';
  required: boolean;
  enabled: boolean;
  isCustom: boolean;
}

export interface User {
  id: string;
  teamId?: string;
  displayName?: string;
  teamName?: string;
  leaderName?: string;
  email: string;
  role: Role;
  points: number;
  diamonds: number;
  lastDiamondPurchase?: any;
  gameId?: string;
  serverId?: string;
  logoUrl?: string; // Add this too since it's used in Profile/Admin
  phoneNumber?: string;
  isVerified?: boolean;
}

export interface Team {
  id: string;
  ownerId?: string;
  seasonId?: string;
  teamName: string;
  leaderName: string;
  customData?: Record<string, any>;
  points: number;
  diamonds: number;
  streak: number;
  upgradeLevel: number;
  rank?: string;
  logoUrl?: string;
  leaderCardUrl?: string;
  players: string[];
  registrationStatus: RegistrationStatus;
  uniqueId: string;
  createdAt: string;
  matchesThisSeason?: number;
  matches?: string[];
  matchesCount?: number;
  lastDiamondPurchase?: any;
  gameId?: string;
  serverId?: string;
  phoneNumber?: string;
  recruitmentSlots?: number;
  publicRatings?: Record<string, number>;
}

export const MATCH_SLOTS = ["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"] as const;

export interface Match {
  id: string;
  teamA: string;
  teamB: string;
  winnerId: string;
  resultType: MatchResultType;
  date: string;
}

export interface Transaction {
  id: string;
  teamId: string;
  type: TransactionType;
  points: number;
  diamonds: number;
  reason: string;
  timestamp: string;
  allowedViewerUids?: string[];
}

export interface Registration {
  id: string;
  userId?: string;
  ownerId?: string;
  seasonId?: string;
  teamName: string;
  leaderName: string;
  leaderEmail: string;
  phoneNumber?: string;
  gameId?: string;
  serverId?: string;
  players: string[];
  logoUrl?: string;
  leaderCardUrl?: string;
  status: RegistrationStatus;
  type: 'new' | 'old';
  timestamp: string;
  uniqueId?: string;
  customData?: Record<string, any>;
}

export interface ChallengeDetails {
  date: string;
  time: string;
  bet: string;
  preferredDate?: string;
  preferredTime?: string;
  sideSelection?: '1st' | '2nd';
  teamSwitch?: boolean;
}

export interface Challenge {
  id: string;
  fromTeamId: string;
  targetTeamIds: string[];
  preferredTimes?: Record<string, string>; // Legacy support or keep for simple time
  challengeDetails?: Record<string, ChallengeDetails>; // targetTeamId -> details
  timestamp: any;
}

export interface ScheduleMatch {
  id: string;
  team1Id?: string;
  team1Name: string;
  team2Id?: string;
  team2Name: string;
  date: string;
  time: string;
  firstPick: string;
  teamSwitch?: boolean;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  matchType?: 'official' | 'challenge' | 'seasonal';
  bet?: number;
  streamUrl?: string;
  createdAt?: any;
  completedAt?: any;
  matchDetails?: {
    winnerId: string;
    resultType: MatchResultType;
    pointsExchanged?: { team1: number, team2: number };
    diamondsExchanged?: { team1: number, team2: number };
    externalLink?: string;
  };
}

export interface Season {
  id: string;
  name: string;
  status: 'upcoming' | 'registration' | 'active' | 'completed';
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

export interface SoloPlayer {
  id: string;
  userId: string;
  name: string;
  gameId: string;
  whatsapp: string;
  fbLink: string;
  mainRole: string;
  subRoles: string[];
  activeTime: string;
  createdAt: any;
  status?: 'active' | 'booked'; // for hiring
  rating?: number;
  verificationRequested?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'challenge' | 'recruitment' | 'system' | 'match';
  link?: string;
  read: boolean;
  createdAt: any;
}

export interface RecruitmentRequest {
  id: string;
  type: 'playerToTeam' | 'teamToPlayer';
  playerId: string;
  teamId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

export interface LiveLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  thumbnailUrl?: string;
  team1Id?: string;
  team2Id?: string;
  team1Name?: string;
  team2Name?: string;
  team1Logo?: string;
  team2Logo?: string;
  order: number;
  createdAt: any;
}

export interface GoogleSheetConfig {
  id: string;
  title: string;
  url: string;
  isPublic: boolean;
}

export interface AppSetting {
  id: string;
  currentSeasonId?: string;
  currentSeasonName?: string;
  challengePhaseLocked: boolean;
  allowOldTeamRegistration: boolean;
  registrationEnabled: boolean;
  guildName?: string;
  discordLink?: string;
  facebookLink?: string;
  announcement?: string;
  maintenanceMode?: boolean;
  maintenanceEndTime?: any;
  rulesUrl?: string;
  messengerLink?: string;
  youtubeLink?: string;
  allowProfileLogoEdit?: boolean;
  formFields?: FormFieldSetting[];
  challengeLimitPerUser?: number;
  bettingEnabled?: boolean;
  showHeroSection?: boolean;
  showScheduleSection?: boolean;
  showFeaturesSection?: boolean;
  showAboutSection?: boolean;
  showShop?: boolean;
  showLeaderboard?: boolean;
  showChallenges?: boolean;
  showDiamonds?: boolean;
  showSoloPlayers?: boolean;
  allowSoloRegistration?: boolean;
  showTrainingGround?: boolean;
  communityRules?: string;
  heroAnnouncement?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  hideLogoUpload?: boolean;
  aboutTitle?: string;
  aboutDescription?: string;
  features?: { title: string; icon: string; desc: string; enabled: boolean }[];
  profileEditsEnabled?: boolean;
  authorizedRecruiters?: string[];
  moderatorPermissions?: Record<string, string[]>;
  adminUids?: string[];
  moderators?: {
    uid: string;
    email: string;
    permissions: string[];
  }[];
  googleSheets?: GoogleSheetConfig[];
}

export interface TrainingPlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  mvps: number;
  totalKd: number;
  avgKd: number;
  winRate: number;
  points: number;
}

export interface TrainingPlayer {
  id: string; // UID as doc ID
  uid: string;
  inGameName: string;
  teamId: string;
  teamName: string;
  mainRole: string;
  currentKd: number;
  rating: number;
  stats: TrainingPlayerStats;
  isBanned?: boolean;
  updatedAt?: any;
}

export interface TrainingTeamStats {
  totalMatches: number;
  wins: number;
  losses: number;
  points: number;
  mvpCount: number;
  totalKd: number;
  avgKd: number;
  winRate: number;
  winStreak?: number;
  diamonds?: number;
}

export interface TrainingTeam {
  id: string;
  teamName: string;
  logoUrl?: string;
  uniqueId: string;
  captainName: string;
  captainUid: string;
  status: RegistrationStatus;
  players: {
    uid: string;
    inGameName: string;
    mainRole: string;
    currentKd: number;
    rating: number;
  }[];
  stats: TrainingTeamStats;
  createdAt: any;
  publicRatings?: Record<string, number>;
}

export interface TrainingMatch {
  id: string;
  teamId: string;
  teamName: string;
  opponentTeamId: string;
  opponentTeamName: string;
  matchNumber: number; // 1, 2, 3, 4
  win: boolean;
  mvpUid: string;
  mvpName: string;
  playerKds: Record<string, number>;
  screenshotUrl?: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  pointsAwarded: number;
  isFlagged?: boolean;
  flagReason?: string;
  createdAt: any;
}

export interface BannedUid {
  id: string;
  uid: string;
  reason?: string;
  bannedBy?: string;
  createdAt: any;
}
