import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 40 }}>
      <h1>Home</h1>
      <p>
        Click around, then open <Link href="/jialytics">/jialytics</Link>.
      </p>
      <Link href="/about">About</Link>
    </main>
  );
}
