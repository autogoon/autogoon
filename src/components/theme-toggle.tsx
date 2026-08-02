import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/button';

const OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="bg-card flex items-center gap-1 rounded-lg border p-1">
      {OPTIONS.map(({ value, icon: Icon }) => (
        <Button
          key={value}
          aria-label={`Use ${value} theme`}
          onClick={() => setTheme(value)}
          className={`rounded-md p-1.5 ${
            theme === value
              ? 'bg-secondary text-secondary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}
