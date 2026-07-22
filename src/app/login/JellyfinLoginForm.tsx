"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  username: z.string().min(1, "Required"),
  password: z.string().min(1, "Required"),
});

type FormValues = z.infer<typeof schema>;

/**
 * "Sign in with Jellyfin" form. Submits straight to Auth.js's "jellyfin"
 * credentials provider — the username/password are verified against the
 * configured Jellyfin server inside authorize() (src/lib/external-auth.ts),
 * never against the local password hash.
 */
export function JellyfinLoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await signIn("jellyfin", {
      ...values,
      redirect: false,
    });
    if (res?.error) {
      setServerError(
        "Jellyfin sign-in failed — check your username and password, or the server may be unreachable.",
      );
      return;
    }
    router.replace("/home");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="jellyfin-username">Jellyfin username</Label>
        <Input
          id="jellyfin-username"
          autoComplete="username"
          {...register("username")}
        />
        {errors.username && (
          <p className="text-xs text-destructive">{errors.username.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="jellyfin-password">Jellyfin password</Label>
        <Input
          id="jellyfin-password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      {serverError && (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      )}

      <Button type="submit" variant="outline" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in with Jellyfin"}
      </Button>
    </form>
  );
}
