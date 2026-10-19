CREATE TABLE "SchoolTheme" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#216b49',
    "secondaryColor" TEXT NOT NULL DEFAULT '#287b59',
    "accentColor" TEXT NOT NULL DEFAULT '#eaf3ec',
    "pageBackground" TEXT NOT NULL DEFAULT '#f4f6f5',
    "surfaceColor" TEXT NOT NULL DEFAULT '#ffffff',
    "textColor" TEXT NOT NULL DEFAULT '#1c2821',
    "mutedTextColor" TEXT NOT NULL DEFAULT '#59665e',
    "borderColor" TEXT NOT NULL DEFAULT '#dfe5e0',
    "mode" TEXT NOT NULL DEFAULT 'LIGHT',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolTheme_schoolId_key"
ON "SchoolTheme"("schoolId");

ALTER TABLE "SchoolTheme"
ADD CONSTRAINT "SchoolTheme_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
