import { ChartStudio } from "./_components/chart-studio";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">unicorn charts</h1>
      <ChartStudio />
    </main>
  );
}
