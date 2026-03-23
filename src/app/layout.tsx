import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrustTrip — 여행 리서치 자동화',
  description: '추천이 아닌 검증. 3개 소스 교차 검증으로 신뢰할 수 있는 장소만 찾아드립니다.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-white text-neutral-dark antialiased">
        {children}
      </body>
    </html>
  );
}
