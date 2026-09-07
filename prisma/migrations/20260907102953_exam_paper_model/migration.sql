-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamPaper_subjectId_idx" ON "ExamPaper"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_examId_subjectId_key" ON "ExamPaper"("examId", "subjectId");

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
