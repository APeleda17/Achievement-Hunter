-- CreateEnum
CREATE TYPE "sunkumas" AS ENUM ('LENGVAS', 'VIDUTINIS', 'SUNKUS', 'LABAI_SUNKUS');

-- CreateEnum
CREATE TYPE "plano_punkto_busena" AS ENUM ('NEATLIKTAS', 'ATLIKTAS');

-- AlterTable
ALTER TABLE "pasiekimas" ADD COLUMN     "ivertinta" TIMESTAMPTZ(3),
ADD COLUMN     "prieinamumas" TEXT,
ADD COLUMN     "prieinamumo_pagrindimas" TEXT,
ADD COLUMN     "retumas_atnaujintas" TIMESTAMPTZ(3),
ADD COLUMN     "retumas_proc" DOUBLE PRECISION,
ADD COLUMN     "sunkumas" "sunkumas",
ADD COLUMN     "tipas" TEXT,
ADD COLUMN     "vertinimo_modelis" TEXT;

-- CreateTable
CREATE TABLE "rinkimo_planas" (
    "id" SERIAL NOT NULL,
    "naudotojo_id" INTEGER NOT NULL,
    "app_id" INTEGER NOT NULL,
    "modelis" TEXT NOT NULL,
    "sukurta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rinkimo_planas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plano_kriterijai" (
    "plano_id" INTEGER NOT NULL,
    "turimas_laikas_min" INTEGER NOT NULL,
    "norimas_sunkumas" "sunkumas",
    "pasiekimo_tipas" TEXT,

    CONSTRAINT "plano_kriterijai_pkey" PRIMARY KEY ("plano_id")
);

-- CreateTable
CREATE TABLE "plano_punktas" (
    "id" SERIAL NOT NULL,
    "plano_id" INTEGER NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "eiles_numeris" INTEGER NOT NULL,
    "numatoma_trukme_min" INTEGER NOT NULL,
    "pagrindimas" TEXT NOT NULL,
    "busena" "plano_punkto_busena" NOT NULL DEFAULT 'NEATLIKTAS',
    "atlikta_kada" TIMESTAMPTZ(3),

    CONSTRAINT "plano_punktas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rinkimo_planas_naudotojo_id_sukurta_idx" ON "rinkimo_planas"("naudotojo_id", "sukurta");

-- CreateIndex
CREATE UNIQUE INDEX "plano_punktas_plano_id_eiles_numeris_key" ON "plano_punktas"("plano_id", "eiles_numeris");

-- CreateIndex
CREATE UNIQUE INDEX "plano_punktas_plano_id_pasiekimo_id_key" ON "plano_punktas"("plano_id", "pasiekimo_id");

-- AddForeignKey
ALTER TABLE "rinkimo_planas" ADD CONSTRAINT "rinkimo_planas_naudotojo_id_fkey" FOREIGN KEY ("naudotojo_id") REFERENCES "naudotojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rinkimo_planas" ADD CONSTRAINT "rinkimo_planas_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "zaidimas"("app_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_kriterijai" ADD CONSTRAINT "plano_kriterijai_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "rinkimo_planas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_punktas" ADD CONSTRAINT "plano_punktas_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "rinkimo_planas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_punktas" ADD CONSTRAINT "plano_punktas_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---- Ranka pridėti CHECK ribojimai (Prisma jų negeneruoja; DB-05, NF-02) ----

ALTER TABLE "pasiekimas" ADD CONSTRAINT "pasiekimas_prieinamumas_check"
  CHECK ("prieinamumas" IS NULL OR "prieinamumas" IN ('PRIEINAMAS', 'NEPRIEINAMAS', 'NEZINOMA'));

ALTER TABLE "pasiekimas" ADD CONSTRAINT "pasiekimas_retumas_proc_check"
  CHECK ("retumas_proc" IS NULL OR ("retumas_proc" >= 0 AND "retumas_proc" <= 100));

ALTER TABLE "plano_kriterijai" ADD CONSTRAINT "plano_kriterijai_turimas_laikas_min_check"
  CHECK ("turimas_laikas_min" BETWEEN 15 AND 600);

ALTER TABLE "plano_punktas" ADD CONSTRAINT "plano_punktas_eiles_numeris_check"
  CHECK ("eiles_numeris" >= 1);

ALTER TABLE "plano_punktas" ADD CONSTRAINT "plano_punktas_numatoma_trukme_min_check"
  CHECK ("numatoma_trukme_min" > 0);