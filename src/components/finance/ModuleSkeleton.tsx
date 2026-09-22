import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant placeholder shown while a dataset switch is propagating. Paints in a
 * single frame so a 15k–50k row switch never looks frozen.
 */
export function ModuleSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="animate-in fade-in duration-150">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Card key={i} className="border-border shadow-card">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-6 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4 border-border shadow-card">
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-[220px] w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
