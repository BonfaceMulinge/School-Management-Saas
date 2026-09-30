-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "level" INTEGER;

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "combinationId" TEXT,
ADD COLUMN     "pathwayId" TEXT;

-- AlterTable
ALTER TABLE "ExamMark" ADD COLUMN     "remark" TEXT;

-- CreateTable
CREATE TABLE "SeniorSchoolPathway" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeniorSchoolPathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectCombination" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "seniorSchoolPathwayId" TEXT,

    CONSTRAINT "SubjectCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectCombinationSubject" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectCombinationSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeniorSchoolPathway_schoolId_archived_idx" ON "SeniorSchoolPathway"("schoolId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "SeniorSchoolPathway_schoolId_code_key" ON "SeniorSchoolPathway"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SeniorSchoolPathway_schoolId_name_key" ON "SeniorSchoolPathway"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SubjectCombination_schoolId_archived_idx" ON "SubjectCombination"("schoolId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCombination_schoolId_code_key" ON "SubjectCombination"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCombination_schoolId_name_key" ON "SubjectCombination"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SubjectCombinationSubject_subjectId_idx" ON "SubjectCombinationSubject"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCombinationSubject_combinationId_subjectId_key" ON "SubjectCombinationSubject"("combinationId", "subjectId");

-- CreateIndex
CREATE INDEX "Class_schoolId_level_archived_idx" ON "Class"("schoolId", "level", "archived");

-- CreateIndex
CREATE INDEX "Enrollment_schoolId_pathwayId_idx" ON "Enrollment"("schoolId", "pathwayId");

-- CreateIndex
CREATE INDEX "Enrollment_schoolId_combinationId_idx" ON "Enrollment"("schoolId", "combinationId");

-- AddForeignKey
ALTER TABLE "SeniorSchoolPathway" ADD CONSTRAINT "SeniorSchoolPathway_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectCombination" ADD CONSTRAINT "SubjectCombination_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectCombination" ADD CONSTRAINT "SubjectCombination_seniorSchoolPathwayId_fkey" FOREIGN KEY ("seniorSchoolPathwayId") REFERENCES "SeniorSchoolPathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectCombinationSubject" ADD CONSTRAINT "SubjectCombinationSubject_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "SubjectCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectCombinationSubject" ADD CONSTRAINT "SubjectCombinationSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "SeniorSchoolPathway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "SubjectCombination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
