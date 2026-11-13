-- CreateEnum
CREATE TYPE "saltinio_tipas" AS ENUM ('WIKI', 'BENDRUOMENES_GIDAS', 'STEAM_GIDAS', 'DISKUSIJA', 'KITA');

-- CreateTable
CREATE TABLE "isorinis_saltinis" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "pavadinimas" TEXT NOT NULL,
    "tipas" "saltinio_tipas" NOT NULL,
    "gauta" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "isorinis_saltinis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saltinio_istrauka" (
    "id" SERIAL NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "saltinio_id" INTEGER NOT NULL,
    "uzklausos_suma" VARCHAR(64) NOT NULL,
    "istrauka" VARCHAR(4000) NOT NULL,
    "gauta" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saltinio_istrauka_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vadovas" (
    "id" SERIAL NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "ivesties_suma" VARCHAR(64) NOT NULL,
    "zingsniai" JSONB NOT NULL,
    "modelis" TEXT NOT NULL,
    "patikima_informacija" BOOLEAN NOT NULL DEFAULT true,
    "sukurta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vadovas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vadovo_saltinis" (
    "vadovo_id" INTEGER NOT NULL,
    "saltinio_id" INTEGER NOT NULL,
    "eiles_numeris" INTEGER NOT NULL,
    "istrauka" VARCHAR(4000) NOT NULL,
    "gauta" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vadovo_saltinis_pkey" PRIMARY KEY ("vadovo_id","saltinio_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "isorinis_saltinis_url_key" ON "isorinis_saltinis"("url");

-- CreateIndex
CREATE INDEX "saltinio_istrauka_pasiekimo_id_uzklausos_suma_gauta_idx" ON "saltinio_istrauka"("pasiekimo_id", "uzklausos_suma", "gauta");

-- CreateIndex
CREATE UNIQUE INDEX "saltinio_istrauka_pasiekimo_id_saltinio_id_key" ON "saltinio_istrauka"("pasiekimo_id", "saltinio_id");

-- CreateIndex
CREATE UNIQUE INDEX "vadovas_pasiekimo_id_key" ON "vadovas"("pasiekimo_id");

-- CreateIndex
CREATE UNIQUE INDEX "vadovo_saltinis_vadovo_id_eiles_numeris_key" ON "vadovo_saltinis"("vadovo_id", "eiles_numeris");

-- AddForeignKey
ALTER TABLE "saltinio_istrauka" ADD CONSTRAINT "saltinio_istrauka_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saltinio_istrauka" ADD CONSTRAINT "saltinio_istrauka_saltinio_id_fkey" FOREIGN KEY ("saltinio_id") REFERENCES "isorinis_saltinis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vadovas" ADD CONSTRAINT "vadovas_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vadovo_saltinis" ADD CONSTRAINT "vadovo_saltinis_vadovo_id_fkey" FOREIGN KEY ("vadovo_id") REFERENCES "vadovas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vadovo_saltinis" ADD CONSTRAINT "vadovo_saltinis_saltinio_id_fkey" FOREIGN KEY ("saltinio_id") REFERENCES "isorinis_saltinis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
