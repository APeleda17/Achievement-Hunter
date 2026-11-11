-- CreateEnum
CREATE TYPE "pasiekimo_busena" AS ENUM ('ATRAKINTAS', 'NEATRAKINTAS');

-- CreateTable
CREATE TABLE "naudotojas" (
    "id" SERIAL NOT NULL,
    "steam_id" TEXT NOT NULL,
    "slapyvardis" TEXT NOT NULL,
    "avataro_url" TEXT,
    "profilis_viesas" BOOLEAN NOT NULL DEFAULT true,
    "paskutinis_atnaujinimas" TIMESTAMPTZ(3),
    "sukurta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "naudotojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zaidimas" (
    "app_id" INTEGER NOT NULL,
    "pavadinimas" TEXT NOT NULL,
    "ikonos_url" TEXT,
    "turi_pasiekimu" BOOLEAN,

    CONSTRAINT "zaidimas_pkey" PRIMARY KEY ("app_id")
);

-- CreateTable
CREATE TABLE "pasiekimas" (
    "id" SERIAL NOT NULL,
    "app_id" INTEGER NOT NULL,
    "api_pavadinimas" TEXT NOT NULL,
    "pavadinimas" TEXT NOT NULL,
    "aprasymas" TEXT,
    "ikonos_url" TEXT,

    CONSTRAINT "pasiekimas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naudotojo_zaidimas" (
    "id" SERIAL NOT NULL,
    "naudotojo_id" INTEGER NOT NULL,
    "app_id" INTEGER NOT NULL,
    "zaidimo_laikas_min" INTEGER NOT NULL DEFAULT 0,
    "atrakinta" INTEGER,
    "is_viso" INTEGER,
    "paskutinis_atnaujinimas" TIMESTAMPTZ(3),

    CONSTRAINT "naudotojo_zaidimas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naudotojo_pasiekimas" (
    "id" SERIAL NOT NULL,
    "naudotojo_id" INTEGER NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "busena" "pasiekimo_busena" NOT NULL,
    "atrakinta_kada" TIMESTAMPTZ(3),

    CONSTRAINT "naudotojo_pasiekimas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesija" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "sesija_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "naudotojas_steam_id_key" ON "naudotojas"("steam_id");

-- CreateIndex
CREATE UNIQUE INDEX "pasiekimas_app_id_api_pavadinimas_key" ON "pasiekimas"("app_id", "api_pavadinimas");

-- CreateIndex
CREATE UNIQUE INDEX "naudotojo_zaidimas_naudotojo_id_app_id_key" ON "naudotojo_zaidimas"("naudotojo_id", "app_id");

-- CreateIndex
CREATE UNIQUE INDEX "naudotojo_pasiekimas_naudotojo_id_pasiekimo_id_key" ON "naudotojo_pasiekimas"("naudotojo_id", "pasiekimo_id");

-- CreateIndex
CREATE INDEX "sesija_expire_idx" ON "sesija"("expire");

-- AddForeignKey
ALTER TABLE "pasiekimas" ADD CONSTRAINT "pasiekimas_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "zaidimas"("app_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naudotojo_zaidimas" ADD CONSTRAINT "naudotojo_zaidimas_naudotojo_id_fkey" FOREIGN KEY ("naudotojo_id") REFERENCES "naudotojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naudotojo_zaidimas" ADD CONSTRAINT "naudotojo_zaidimas_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "zaidimas"("app_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naudotojo_pasiekimas" ADD CONSTRAINT "naudotojo_pasiekimas_naudotojo_id_fkey" FOREIGN KEY ("naudotojo_id") REFERENCES "naudotojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "naudotojo_pasiekimas" ADD CONSTRAINT "naudotojo_pasiekimas_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
