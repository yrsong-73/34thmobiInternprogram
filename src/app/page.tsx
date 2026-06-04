import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// 루트(/) 접속 시 → 로그인 여부에 따라 분기
export default async function Home() {
  const session = await getServerSession(authOptions)
  if (session) {
    redirect('/schedule')
  } else {
    redirect('/login')
  }
}
