import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

export function SearchBar({
  onSearch,
  autoFocus,
  className,
}: {
  onSearch?: (q: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    if (onSearch) onSearch(query);
    else navigate(`/app/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <form
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector("input");
        submit(input?.value ?? "");
      }}
    >
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        placeholder="Ask DROP anything — “black shoes I saved”"
        className="h-13 rounded-2xl border-border/80 bg-card py-3.5 pl-11 pr-12 text-[15px] shadow-none focus-visible:ring-primary/40"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 text-primary hover:bg-accent hover:text-primary"
        aria-label="Search"
      >
        <Sparkles className="h-[18px] w-[18px]" />
      </Button>
    </form>
  );
}
