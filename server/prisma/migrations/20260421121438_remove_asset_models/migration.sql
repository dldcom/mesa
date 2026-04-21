/*
  Warnings:

  - You are about to drop the `Character` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Item` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Map` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Character" DROP CONSTRAINT "Character_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Map" DROP CONSTRAINT "Map_createdBy_fkey";

-- DropTable
DROP TABLE "Character";

-- DropTable
DROP TABLE "Item";

-- DropTable
DROP TABLE "Map";
