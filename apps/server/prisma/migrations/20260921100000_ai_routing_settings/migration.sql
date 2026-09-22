CREATE TABLE "AiRoutingSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "researchDefaultProvider" TEXT,
    "researchDefaultModel" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoutingSettings_pkey" PRIMARY KEY ("id")
);
