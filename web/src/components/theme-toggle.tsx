"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={dark ? "밝은 테마로 전환" : "어두운 테마로 전환"}
            onClick={() => setTheme(dark ? "light" : "dark")}
          />
        }
      >
        {dark ? <SunIcon /> : <MoonIcon />}
      </TooltipTrigger>
      <TooltipContent>{dark ? "밝은 테마" : "어두운 테마"}</TooltipContent>
    </Tooltip>
  );
}
