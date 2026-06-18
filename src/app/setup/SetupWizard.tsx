"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type SlskdTestResult,
  finalizeSetupAction,
  testSlskdAction,
} from "./actions";

type Step = "admin" | "slskd" | "finish";

type AdminData = { username: string; email: string; password: string };
type SlskdData = { url: string; apiKey: string; downloadPath: string };

const STEPS: { id: Step; title: string }[] = [
  { id: "admin", title: "Admin account" },
  { id: "slskd", title: "Soulseek" },
  { id: "finish", title: "Finish" },
];

export function SetupWizard() {
  const [step, setStep] = useState<Step>("admin");
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [slskd, setSlskd] = useState<SlskdData | null>(null);

  return (
    <div className="w-full max-w-xl space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Audioseerr setup</h1>
        <p className="text-sm text-muted-foreground">
          Three quick steps and you&apos;re ready to go.
        </p>
      </div>

      <ol className="flex items-center gap-2 text-xs text-muted-foreground">
        {STEPS.map((s, i) => {
          const active = s.id === step;
          const done =
            STEPS.findIndex((x) => x.id === step) > i ||
            (s.id === "admin" && admin) ||
            (s.id === "slskd" && slskd);
          return (
            <li key={s.id} className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] " +
                  (active
                    ? "border-primary text-primary"
                    : done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30")
                }
              >
                {i + 1}
              </span>
              <span className={active ? "text-foreground" : ""}>{s.title}</span>
              {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground/50">→</span>}
            </li>
          );
        })}
      </ol>

      {step === "admin" && (
        <AdminStep
          initial={admin}
          onSubmit={(data) => {
            setAdmin(data);
            setStep("slskd");
          }}
        />
      )}
      {step === "slskd" && (
        <SlskdStep
          initial={slskd}
          onBack={() => setStep("admin")}
          onSubmit={(data) => {
            setSlskd(data);
            setStep("finish");
          }}
        />
      )}
      {step === "finish" && admin && slskd && (
        <FinishStep admin={admin} slskd={slskd} onBack={() => setStep("slskd")} />
      )}
    </div>
  );
}

const adminSchema = z
  .object({
    username: z.string().min(2, "At least 2 characters").max(64),
    email: z.string().email("Must be a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type AdminForm = z.infer<typeof adminSchema>;

function AdminStep({
  initial,
  onSubmit,
}: {
  initial: AdminData | null;
  onSubmit: (d: AdminData) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminForm>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      username: initial?.username ?? "",
      email: initial?.email ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create the first admin</CardTitle>
        <CardDescription>
          You&apos;ll use this account to approve requests and manage other users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={handleSubmit((d) =>
            onSubmit({ username: d.username, email: d.email, password: d.password }),
          )}
        >
          <Field label="Username" id="username" error={errors.username?.message}>
            <Input id="username" autoComplete="username" autoFocus {...register("username")} />
          </Field>
          <Field label="Email" id="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Password" id="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
          </Field>
          <Field
            label="Confirm password"
            id="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const slskdCredsSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "Required"),
  downloadPath: z.string().optional(),
});

type SlskdCredsForm = z.infer<typeof slskdCredsSchema>;

function SlskdStep({
  initial,
  onBack,
  onSubmit,
}: {
  initial: SlskdData | null;
  onBack: () => void;
  onSubmit: (d: SlskdData) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SlskdCredsForm>({
    resolver: zodResolver(slskdCredsSchema),
    defaultValues: {
      url: initial?.url ?? "",
      apiKey: initial?.apiKey ?? "",
      downloadPath: initial?.downloadPath ?? "",
    },
  });

  const [test, setTest] = useState<SlskdTestResult | null>(
    initial ? { ok: true } : null,
  );

  const runTest = handleSubmit(async (creds) => {
    setTest(await testSlskdAction({ url: creds.url, apiKey: creds.apiKey }));
  });

  const goNext = () => {
    if (!test?.ok) return;
    const creds = watch();
    onSubmit({
      url: creds.url,
      apiKey: creds.apiKey,
      downloadPath: creds.downloadPath ?? "",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Soulseek (slskd)</CardTitle>
        <CardDescription>
          Audioseerr downloads everything through slskd. Enter its URL and an API
          key (slskd config → web.authentication.api_keys).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={runTest}>
          <Field label="slskd URL" id="url" error={errors.url?.message}>
            <Input
              id="url"
              placeholder="http://slskd:5030"
              autoComplete="off"
              {...register("url")}
            />
          </Field>
          <Field label="API key" id="apiKey" error={errors.apiKey?.message}>
            <Input id="apiKey" autoComplete="off" {...register("apiKey")} />
          </Field>
          <Field label="Download path (optional)" id="downloadPath">
            <Input
              id="downloadPath"
              placeholder="/downloads"
              autoComplete="off"
              {...register("downloadPath")}
            />
            <p className="text-xs text-muted-foreground">
              slskd&apos;s completed-downloads directory. You can set this later
              in Settings.
            </p>
          </Field>

          <div>
            <Button type="submit" variant="secondary" disabled={isSubmitting}>
              {isSubmitting ? "Testing..." : "Test connection"}
            </Button>
          </div>

          {test && !test.ok && (
            <p className="text-sm text-destructive" role="alert">
              {test.error}
            </p>
          )}
          {test?.ok && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              Connected to slskd.
            </div>
          )}
        </form>

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={onBack} type="button">
            Back
          </Button>
          <Button type="button" onClick={goNext} disabled={!test?.ok}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const finishSchema = z.object({
  lastFmApiKey: z.string().optional(),
});

type FinishForm = z.infer<typeof finishSchema>;

function FinishStep({
  admin,
  slskd,
  onBack,
}: {
  admin: AdminData;
  slskd: SlskdData;
  onBack: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FinishForm>({
    resolver: zodResolver(finishSchema),
    defaultValues: { lastFmApiKey: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await finalizeSetupAction({
      admin,
      slskd,
      lastFmApiKey: values.lastFmApiKey,
    });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.replace("/login");
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last.fm</CardTitle>
        <CardDescription>
          Last.fm powers charts and similar-artist data. Optional, but discovery is much
          better with it. After setup, you can invite additional users from
          /admin/users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Last.fm API key (optional)" id="lastFmApiKey">
            <Input id="lastFmApiKey" autoComplete="off" {...register("lastFmApiKey")} />
            <p className="text-xs text-muted-foreground">
              Get one free at last.fm/api/account/create.
            </p>
          </Field>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" type="button" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Finishing setup..." : "Finish setup"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
