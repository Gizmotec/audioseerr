"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (!q) return;
        router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Input
        name="q"
        autoFocus
        autoComplete="off"
        placeholder="Search artists, songs, or albums…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 rounded-full text-base"
      />
      <Button type="submit" size="lg" className="h-11 px-5 text-base">
        Search
      </Button>
    </form>
  );
}
