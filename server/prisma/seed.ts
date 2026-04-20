// 초기 관리자 계정 시드
// 실행: `npm run seed` (server 폴더 내에서)

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME ?? 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'changeme';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`✓ 관리자 계정 '${username}' 이미 존재.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      username,
      password: hashed,
      role: 'ADMIN',
    },
  });

  console.log(`✅ 초기 관리자 생성됨: ${admin.username} (id=${admin.id})`);
  console.log(`   비밀번호: ${password}  ← 실사용 전에 반드시 변경`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
