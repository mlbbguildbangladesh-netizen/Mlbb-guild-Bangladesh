# Security Specification - MGB Guild System

## Data Invariants
1. **User Ownership**: Only the authenticated owner can read or partially update their user document.
2. **Identity Integrity**: `userId` in registration must match `request.auth.uid`.
3. **Role Protection**: The `role` field in a user document can only be set to `admin` by an existing admin or if the email matches the hardcoded admin email during initial creation.
4. **Currency Integrity**: `points` and `diamonds` can only be modified by admins.
5. **Registration Authority**: Only admins can approve or reject registrations.
6. **Immutable Fields**: `createdAt` in teams and users cannot be changed after creation.
7. **Team Isolation**: Only the owner of a team (or admin) can update its properties (logo, card, roster).
8. **Public Access**: Leaderboards and team profiles are publicly readable.

## The "Dirty Dozen" Payloads

### Payload 1: Identity Spoofing (Registration)
Target: `/registrations/{anyId}`
Action: Create
Payload: `{"userId": "another_user_id", "teamName": "Evil Team", ...}`
Result: **PERMISSION_DENIED** (userId must match request.auth.uid)

### Payload 2: Privilege Escalation (User Update)
Target: `/users/{myId}`
Action: Update
Payload: `{"role": "admin"}`
Result: **PERMISSION_DENIED** (role is not in affectedKeys)

### Payload 3: Currency Inject (User Update)
Target: `/users/{myId}`
Action: Update
Payload: `{"points": 999999}`
Result: **PERMISSION_DENIED** (points not in affectedKeys)

### Payload 4: Unauthorized Team Update
Target: `/teams/{notMyTeam}`
Action: Update
Payload: `{"teamName": "Hacked Name"}`
Result: **PERMISSION_DENIED** (Not the owner)

### Payload 5: Shadow Field Injection
Target: `/users/{myId}`
Action: Update
Payload: `{"isAdmin": true, "displayName": "New Name"}`
Result: **PERMISSION_DENIED** (isAdmin is a shadow field, hasOnly should block it)

### Payload 6: Registration Hijack
Target: `/registrations/{id}`
Action: Update
Payload: `{"status": "approved"}`
Result: **PERMISSION_DENIED** (Only admin can update registrations)

### Payload 7: Resource Exhaustion (ID Poisoning)
Target: `/users/very_long_id_exceeding_128_chars...`
Action: Create
Result: **PERMISSION_DENIED** (isValidId check)

### Payload 8: Immutable Bypass (Team)
Target: `/teams/{myTeamId}`
Action: Update
Payload: `{"createdAt": "2000-01-01T00:00:00Z"}`
Result: **PERMISSION_DENIED** (createdAt is immutable)

### Payload 9: Orphaned Team Creation
Target: `/teams/{newId}`
Action: Create
Payload: `{"teamName": "Ghost Team"}`
Result: **PERMISSION_DENIED** (Only admin can create teams directly, or via registration process which is admin-mediated)

### Payload 10: State Shortcut (Match result)
Target: `/matches/{id}`
Action: Create
Payload: `{"winnerId": "myTeam"}`
Result: **PERMISSION_DENIED** (Only admin can write to matches)

### Payload 11: PII Leak (Read not-owned user)
Target: `/users/{otherUserId}`
Action: Get
Result: **PERMISSION_DENIED** (Non-admin reading other user)

### Payload 12: Mass Scraping (List Users)
Target: `/users`
Action: List
Result: **PERMISSION_DENIED** (No blanket list allowed, must query by specific key if allowed)

## Test Runner
A `firestore.rules.test.ts` would be needed to verify these, but since I cannot run it easily without a proper setup, I will focus on making the rules mathematically sound against these.
