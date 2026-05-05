"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ReportState = "idle" | "captured";

export function BugReportForm() {
  const [state, setState] = useState<ReportState>("idle");

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setState("captured");
      }}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
        <Field label="Short title" id="bug-title" required>
          <Input
            id="bug-title"
            name="title"
            placeholder="Search results freeze"
            required
            onChange={() => setState("idle")}
          />
        </Field>

        <Field label="Severity" id="bug-severity">
          <select
            id="bug-severity"
            name="severity"
            defaultValue="medium"
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            onChange={() => setState("idle")}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>

      <Field label="Where did it happen?" id="bug-area">
        <Input
          id="bug-area"
          name="area"
          placeholder="Library, search, requests, playback..."
          onChange={() => setState("idle")}
        />
      </Field>

      <Field label="What happened?" id="bug-description" required>
        <Textarea
          id="bug-description"
          name="description"
          placeholder="Describe the problem and what you were trying to do."
          required
          className="min-h-32"
          onChange={() => setState("idle")}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Expected result" id="bug-expected">
          <Textarea
            id="bug-expected"
            name="expected"
            placeholder="What should Audioseerr have done?"
            onChange={() => setState("idle")}
          />
        </Field>

        <Field label="Actual result" id="bug-actual">
          <Textarea
            id="bug-actual"
            name="actual"
            placeholder="What did you see instead?"
            onChange={() => setState("idle")}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          Reports are not sent or saved yet. This form only captures the shape
          of the future workflow.
        </p>
        <Button type="submit" className="sm:w-auto">
          {state === "captured" ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Captured locally
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Submit report
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-muted-foreground">*</span>}
      </Label>
      {children}
    </div>
  );
}
