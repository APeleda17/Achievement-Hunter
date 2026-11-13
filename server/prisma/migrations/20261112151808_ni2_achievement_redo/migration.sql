-- CreateTable
CREATE TABLE "pasiekimo_paaiskinimas" (
    "id" SERIAL NOT NULL,
    "pasiekimo_id" INTEGER NOT NULL,
    "tekstas" TEXT NOT NULL,
    "saltinio_kontroline_suma" VARCHAR(64) NOT NULL,
    "modelis" TEXT NOT NULL,
    "sukurta" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pasiekimo_paaiskinimas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pasiekimo_paaiskinimas_pasiekimo_id_key" ON "pasiekimo_paaiskinimas"("pasiekimo_id");

-- AddForeignKey
ALTER TABLE "pasiekimo_paaiskinimas" ADD CONSTRAINT "pasiekimo_paaiskinimas_pasiekimo_id_fkey" FOREIGN KEY ("pasiekimo_id") REFERENCES "pasiekimas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
