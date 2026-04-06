-- CreateIndex
CREATE INDEX "Game_userId_status_idx" ON "Game"("userId", "status");

-- CreateIndex
CREATE INDEX "Game_userId_createdAt_idx" ON "Game"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "PlayerSeason_userId_idx" ON "PlayerSeason"("userId");
