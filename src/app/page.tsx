import Link from "next/link";
import { button } from "@/lib/ui";

export default function Home() {
  return (
    <div className="space-y-4 pt-16 text-center">
      <h1 className="text-3xl font-semibold">Fanbase OS</h1>
      <p className="text-neutral-600">Gather ideas from your fans in one place.</p>
      <Link href="/login" className={button}>
        Log in
      </Link>
    </div>
  );
}
