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
  type LidarrTestResult,
  finalizeSetupAction,
  testLidarrAction,
} from "./actions";

type Step = "admin" | "lidarr" | "finish";

type AdminData = { username: string; email: string; password: string };
type LidarrData = {
  url: string;
  apiKey: string;
  qualityProfileId: number;
  rootFolderPath: string;
  version: string;
};

const STEPS: { id: Step; title: string }[] = [
  { id: "admin", title: "Admin account" },
  { id: "lidarr", title: "Lidarr" },
  { id: "finish", title: "Finish" },
];

export function SetupWizard() {
  const [step, setStep] = useState<Step>("admin");
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [lidarr, setLidarr] = useState<LidarrData | null>(null);

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
            (s.id === "lidarr" && lidarr);
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
            setStep("lidarr");
          }}
        />
      )}
      {step === "lidarr" && (
        <LidarrStep
          initial={lidarr}
          onBack={() => setStep("admin")}
          onSubmit={(data) => {
            setLidarr(data);
            setStep("finish");
          }}
        />
      )}
      {step === "finish" && admin && lidarr && (
        <FinishStep
          admin={admin}
          lidarr={lidarr}
          onBack={() => setStep("lidarr")}
        />
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

const lidarrCredsSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "Required"),
});

type LidarrCredsForm = z.infer<typeof lidarrCredsSchema>;

function LidarrStep({
  initial,
  onBack,
  onSubmit,
}: {
  initial: LidarrData | null;
  onBack: () => void;
  onSubmit: (d: LidarrData) => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LidarrCredsForm>({
    resolver: zodResolver(lidarrCredsSchema),
    defaultValues: {
      url: initial?.url ?? "",
      apiKey: initial?.apiKey ?? "",
    },
  });

  const [test, setTest] = useState<LidarrTestResult | null>(
    initial
      ? { ok: true, version: initial.version, profiles: [], rootFolders: [] }
      : null,
  );
  const [profileId, setProfileId] = useState<number | "">(
    initial?.qualityProfileId ?? "",
  );
  const [rootPath, setRootPath] = useState<string>(initial?.rootFolderPath ?? "");

  const runTest = handleSubmit(async (creds) => {
    const result = await testLidarrAction(creds);
    setTest(result);
    if (result.ok && !profileId && result.profiles[0]) {
      setProfileId(result.profiles[0].id);
    }
    if (result.ok && !rootPath && result.rootFolders[0]) {
      setRootPath(result.rootFolders[0].path);
    }
  });

  const goNext = () => {
    if (!test?.ok || !profileId || !rootPath) return;
    const creds = watch();
    onSubmit({
      url: creds.url,
      apiKey: creds.apiKey,
      qualityProfileId: Number(profileId),
      rootFolderPath: rootPath,
      version: test.version,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Lidarr</CardTitle>
        <CardDescription>
          Audioseerr needs Lidarr&apos;s URL and API key to send approved requests.
          You&apos;ll find the API key in Lidarr under Settings → General.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={runTest}>
          <Field label="Lidarr URL" id="url" error={errors.url?.message}>
            <Input
              id="url"
              placeholder="http://lidarr:8686"
              autoComplete="off"
              {...register("url")}
            />
          </Field>
          <Field label="API key" id="apiKey" error={errors.apiKey?.message}>
            <Input id="apiKey" autoComplete="off" {...register("apiKey")} />
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
              Connected to Lidarr {test.version}
            </div>
          )}
        </form>

        {test?.ok && test.profiles.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile">Default quality profile</Label>
              <select
                id="profile"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={profileId}
                onChange={(e) => setProfileId(Number(e.target.value))}
              >
                {test.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="root">Default root folder</Label>
              <select
                id="root"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
              >
                {test.rootFolders.map((r) => (
                  <option key={r.id} value={r.path}>
                    {r.path}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button variant="ghost" onClick={onBack} type="button">
            Back
          </Button>
          <Button
            type="button"
            onClick={goNext}
            disabled={!test?.ok || !profileId || !rootPath}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const finishSchema = z.object({
  lastFmApiKey: z.string().optional(),
  registrationMode: z.enum(["CLOSED", "OPEN"]),
});

type FinishForm = z.infer<typeof finishSchema>;

function FinishStep({
  admin,
  lidarr,
  onBack,
}: {
  admin: AdminData;
  lidarr: LidarrData;
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
    defaultValues: { lastFmApiKey: "", registrationMode: "CLOSED" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await finalizeSetupAction({
      admin,
      lidarr: {
        url: lidarr.url,
        apiKey: lidarr.apiKey,
        qualityProfileId: lidarr.qualityProfileId,
        rootFolderPath: lidarr.rootFolderPath,
      },
      lastFmApiKey: values.lastFmApiKey,
      registrationMode: values.registrationMode,
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
        <CardTitle>Last.fm and access</CardTitle>
        <CardDescription>
          Last.fm powers charts and similar-artist data. Optional, but discovery is much
          better with it.
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

          <div className="space-y-2">
            <Label htmlFor="registrationMode">Who can sign up?</Label>
            <select
              id="registrationMode"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...register("registrationMode")}
            >
              <option value="CLOSED">Closed — admin creates accounts</option>
              <option value="OPEN">Open — anyone can register</option>
            </select>
          </div>

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
