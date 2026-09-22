-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT');
ALTER TABLE "public"."Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'SCHOOL_ADMIN';
COMMIT;