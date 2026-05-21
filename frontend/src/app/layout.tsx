import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CodeForge - Premium Multi-Language Online Compiler',
  description: 'Compile and run Python, C, C++, JavaScript, PHP, Java, Assembly, and more. A premium cloud-based development environment with Docker sandboxed execution.',
  keywords: 'online compiler, code editor, python, javascript, c++, java, docker, sandbox',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07070a] text-gray-100 antialiased selection:bg-accent-500/30">
        {children}
      </body>
    </html>
  );
}
