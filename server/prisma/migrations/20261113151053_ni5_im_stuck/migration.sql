-- CreateTable
CREATE TABLE "pagalbos_uzklausa" (
    "id" SERIAL NOT NULL,
    "naudotojo_id" INTEGER NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "ivesties_suma" VARCHAR(64) NOT NULL,
    "problemos_aprasas" VARCHAR(500) NOT NULL,
    "galimos_priezastys" JSONB NOT NULL,
    "sprendimo_zingsniai" JSONB NOT NULL,
    "saltiniu_kopija" JSONB NOT NULL,
    "modelis" TEXT NOT NULL,
    "sukurta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagalbos_uzklausa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pagalbos_uzklausa_naudotojo_id_pasiekimo_id_sukurta_idx" ON "pagalbos_uzklausa"("naudotojo_id", "pasiekimo_id", "sukurta");

-- CreateIndex
CREATE UNIQUE INDEX "pagalbos_uzklausa_naudotojo_id_ivesties_suma_key" ON "pagalbos_uzklausa"("naudotojo_id", "ivesties_suma");

-- AddForeignKey
ALTER TABLE "pagalbos_uzklausa" ADD CONSTRAINT "pagalbos_uzklausa_naudotojo_id_fkey" FOREIGN KEY ("naudotojo_id") REFERENCES "naudotojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagalbos_uzklausa" ADD CONSTRAINT "pagalbos_uzklausa_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
