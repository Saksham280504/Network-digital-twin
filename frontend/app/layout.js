import { Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata = {
  title: 'Network Digital Twin — ML Congestion Predictor',
  description:
    'Interactive fault-tolerant Network Digital Twin with ML-powered congestion prediction and Policy-Based Routing (Dijkstra PBR).',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className="font-outfit bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
