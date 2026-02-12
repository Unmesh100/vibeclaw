/**
 * Realistic Next.js + Convex App Demo
 *
 * This demo creates a more realistic Next.js application structure
 * with Radix UI components, Tailwind CSS, and a mocked Convex backend.
 */

import { VirtualFS } from './virtual-fs';
import { Runtime } from './runtime';
import { NextDevServer } from './frameworks/next-dev-server';
import { getServerBridge } from './server-bridge';
import { Buffer } from './shims/stream';
import { PackageManager, InstallOptions, InstallResult } from './npm';

/**
 * Package.json for a realistic Next.js + Convex app
 */
const PACKAGE_JSON = {
  name: "convex-app-demo",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
  },
  dependencies: {
    // Core
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    // UI
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.1.0",
    "lucide-react": "^0.400.0",
    // Forms
    "zod": "^3.24.2",
    // Date
    "date-fns": "^3.6.0",
  },
  devDependencies: {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.9.3",
  }
};

/**
 * Minimal packages to install for demo (others loaded from CDN)
 */
const DEMO_PACKAGES = [
  'clsx',
  'tailwind-merge',
  'zod',
  'date-fns',
];

/**
 * Create the project structure in the virtual filesystem
 */
export function createConvexAppProject(vfs: VirtualFS): void {
  // Create package.json
  vfs.writeFileSync('/package.json', JSON.stringify(PACKAGE_JSON, null, 2));

  // Create directories - App Router structure
  vfs.mkdirSync('/app', { recursive: true });
  vfs.mkdirSync('/app/api', { recursive: true });
  vfs.mkdirSync('/app/tasks', { recursive: true });
  vfs.mkdirSync('/components', { recursive: true });
  vfs.mkdirSync('/components/ui', { recursive: true });
  vfs.mkdirSync('/lib', { recursive: true });
  vfs.mkdirSync('/convex', { recursive: true });
  vfs.mkdirSync('/public', { recursive: true });

  // Create convex.json configuration (required by Convex CLI)
  vfs.writeFileSync('/convex.json', JSON.stringify({
    functions: "convex/"
  }, null, 2));

  // Create TypeScript config
  vfs.writeFileSync('/tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: "es5",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      paths: {
        "@/*": ["./*"]
      }
    },
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"]
  }, null, 2));

  // Create Tailwind config
  vfs.writeFileSync('/tailwind.config.js', `/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
`);

  // Create global CSS with Tailwind and shadcn/ui CSS variables
  vfs.writeFileSync('/app/globals.css', `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`);

  // Create utility lib (cn function from shadcn/ui)
  vfs.writeFileSync('/lib/utils.ts', `// Utility functions
// Note: In production, use clsx and tailwind-merge packages

export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ');
}
`);

  // Create Convex config (required by CLI bundler)
  // IMPORTANT: CLI needs BOTH .ts and .js versions!
  vfs.writeFileSync('/convex/convex.config.ts', `import { defineApp } from "convex/server";

const app = defineApp();
export default app;
`);
  vfs.writeFileSync('/convex/convex.config.js', `import { defineApp } from "convex/server";

const app = defineApp();
export default app;
`);

  // Create Convex schema
  vfs.writeFileSync('/convex/schema.ts', `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    completed: v.boolean(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  }),
});
`);

  // Create Convex functions for todos
  vfs.writeFileSync('/convex/todos.ts', `import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("todos").order("desc").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("todos", {
      title: args.title,
      completed: false,
      priority: args.priority,
    });
  },
});

export const toggle = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    const todo = await ctx.db.get(args.id);
    if (!todo) throw new Error("Todo not found");
    await ctx.db.patch(args.id, { completed: !todo.completed });
  },
});

export const remove = mutation({
  args: { id: v.id("todos") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
`);

  // Create Convex API (normally auto-generated, but we create manually for the demo)
  // This creates function references that Convex's useQuery/useMutation understand
  vfs.writeFileSync('/convex/_generated/api.ts', `// Convex API - manually created for browser demo
// In a real project, this is auto-generated by 'npx convex dev'

// Function references for the Convex client
// These are string identifiers that map to server functions
export const api = {
  todos: {
    list: "todos:list",
    create: "todos:create",
    toggle: "todos:toggle",
    remove: "todos:remove",
  },
} as const;
`);

  // Create server stubs (needed for schema/function imports to work)
  vfs.writeFileSync('/convex/_generated/server.ts', `// Server stubs for browser demo
// In a real project, this is auto-generated by Convex

export function query<Args, Output>(config: {
  args: Args;
  handler: (ctx: any, args: any) => Promise<Output>;
}) {
  return config;
}

export function mutation<Args, Output>(config: {
  args: Args;
  handler: (ctx: any, args: any) => Promise<Output>;
}) {
  return config;
}
`);

  // Create Convex provider using real Convex client from CDN
  vfs.writeFileSync('/lib/convex.tsx', `"use client";

import React, { useState, useEffect } from 'react';
import { ConvexProvider as BaseConvexProvider, ConvexReactClient, useQuery as useConvexQuery, useMutation as useConvexMutation } from 'convex/react';

// Re-export the API
export { api } from '../convex/_generated/api.ts';

// Get Convex URL using standard Next.js env var pattern
// Falls back to window.__CONVEX_URL__ for backwards compatibility
const getConvexUrl = () => {
  // Standard Next.js pattern: process.env.NEXT_PUBLIC_*
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CONVEX_URL) {
    return process.env.NEXT_PUBLIC_CONVEX_URL;
  }
  // Fallback for backwards compatibility
  if (typeof window !== 'undefined' && (window as any).__CONVEX_URL__) {
    return (window as any).__CONVEX_URL__;
  }
  return null;
};

// Create client lazily
let client: ConvexReactClient | null = null;

function getClient() {
  const url = getConvexUrl();
  if (!url) return null;
  if (!client || (client as any)._address !== url) {
    client = new ConvexReactClient(url);
  }
  return client;
}

// Wrapper hooks that handle the case when Convex is not connected
export function useQuery(query: any, ...args: any[]) {
  const url = getConvexUrl();
  // When not connected, return undefined
  if (!url) return undefined;
  return useConvexQuery(query, ...args);
}

export function useMutation(mutation: any) {
  const url = getConvexUrl();
  const convexMutation = url ? useConvexMutation(mutation) : null;

  return async (args: any) => {
    if (!convexMutation) {
      console.warn('Convex not connected - mutation ignored');
      return;
    }
    return convexMutation(args);
  };
}

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  const [convexUrl, setConvexUrl] = useState(getConvexUrl());

  // Check for URL changes (after deploy)
  useEffect(() => {
    const checkUrl = () => {
      const url = getConvexUrl();
      if (url !== convexUrl) {
        setConvexUrl(url);
      }
    };

    // Check periodically for URL changes
    const interval = setInterval(checkUrl, 1000);
    return () => clearInterval(interval);
  }, [convexUrl]);

  const convexClient = getClient();

  if (!convexClient) {
    // Show a message when Convex is not configured
    return (
      <div className="min-h-screen bg-background font-sans antialiased">
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-2xl font-bold">Connect to Convex</h2>
            <p className="text-muted-foreground">
              Enter your Convex deploy key in the console panel and click "Deploy Schema" to connect.
            </p>
            <div className="p-4 bg-muted rounded-lg text-left text-sm">
              <p className="font-medium mb-2">Files ready in /convex/:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>schema.ts - Database schema (todos table)</li>
                <li>todos.ts - Query and mutation functions</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Get a deploy key from your Convex dashboard at convex.dev
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BaseConvexProvider client={convexClient}>
      {children}
    </BaseConvexProvider>
  );
}
`);

  // Create Button component (shadcn/ui style)
  vfs.writeFileSync('/components/ui/button.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
};

const buttonSizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    />
  );
}
`);

  // Create Card component
  vfs.writeFileSync('/components/ui/card.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-2xl font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}
`);

  // Create Input component
  vfs.writeFileSync('/components/ui/input.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
`);

  // Create Badge component
  vfs.writeFileSync('/components/ui/badge.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

const badgeVariants = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  outline: "text-foreground",
  success: "border-transparent bg-green-500 text-white",
  warning: "border-transparent bg-yellow-500 text-white",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
`);

  // Create Checkbox component
  vfs.writeFileSync('/components/ui/checkbox.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({ className, checked, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    />
  );
}
`);

  // Create Select component (simplified)
  vfs.writeFileSync('/components/ui/select.tsx', `import React from 'react';
import { cn } from '../../lib/utils.ts';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
`);

  // Create TaskList component (uses real Convex API)
  vfs.writeFileSync('/components/task-list.tsx', `"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Select } from './ui/select.tsx';
import { useQuery, useMutation, api } from '../lib/convex.tsx';
import { cn } from '../lib/utils.ts';

type Todo = {
  _id: string;
  _creationTime: number;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
};

const priorityColors = {
  low: "success" as const,
  medium: "warning" as const,
  high: "destructive" as const,
};

function TaskItem({
  task,
  onToggle,
  onDelete
}: {
  task: Todo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 border rounded-lg transition-all",
      task.completed && "opacity-50 bg-muted"
    )}>
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
      />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          task.completed && "line-through text-muted-foreground"
        )}>
          {task.title}
        </p>
        <p className="text-xs text-muted-foreground">
          Created {new Date(task._creationTime).toLocaleDateString()}
        </p>
      </div>
      <Badge variant={priorityColors[task.priority]}>
        {task.priority}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
    </div>
  );
}

export function TaskList() {
  const todos = useQuery(api.todos.list) as Todo[] | undefined;
  const createTodo = useMutation(api.todos.create);
  const toggleTodo = useMutation(api.todos.toggle);
  const removeTodo = useMutation(api.todos.remove);

  const [newTitle, setNewTitle] = React.useState("");
  const [priority, setPriority] = React.useState<Todo["priority"]>("medium");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await createTodo({ title: newTitle.trim(), priority });
    setNewTitle("");
  };

  const completedCount = todos?.filter(t => t.completed).length ?? 0;
  const totalCount = todos?.length ?? 0;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Task Manager
          <Badge variant="secondary">
            {completedCount}/{totalCount} done
          </Badge>
        </CardTitle>
        <CardDescription>
          Real-time sync powered by Convex - running from the browser!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            placeholder="Add a new task..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1"
          />
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Todo["priority"])}
            className="w-32"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
          <Button type="submit">Add Task</Button>
        </form>

        <div className="space-y-2">
          {todos === undefined ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading tasks...
            </div>
          ) : todos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tasks yet. Add one above!
            </div>
          ) : (
            todos.map((task) => (
              <TaskItem
                key={task._id}
                task={task}
                onToggle={() => toggleTodo({ id: task._id })}
                onDelete={() => removeTodo({ id: task._id })}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
`);

  // Create root layout (App Router)
  // Note: In browser environment, we don't use <html>/<head>/<body> tags
  // since we're rendering inside an existing HTML document's #__next div
  vfs.writeFileSync('/app/layout.tsx', `import React from 'react';
import './globals.css';
import { ConvexProvider } from '../lib/convex.tsx';

export const metadata = {
  title: 'Convex App Demo',
  description: 'A realistic Next.js + Convex app running in the browser',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConvexProvider>
      <div className="min-h-screen bg-background font-sans antialiased">
        <div className="relative flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center">
              <div className="mr-4 flex">
                <a href="/" className="mr-6 flex items-center space-x-2">
                  <span className="font-bold text-xl">TaskApp</span>
                </a>
                <nav className="flex items-center space-x-6 text-sm font-medium">
                  <a href="/" className="transition-colors hover:text-foreground/80 text-foreground">
                    Home
                  </a>
                  <a href="/tasks" className="transition-colors hover:text-foreground/80 text-muted-foreground">
                    Tasks
                  </a>
                  <a href="/about" className="transition-colors hover:text-foreground/80 text-muted-foreground">
                    About
                  </a>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-14 md:flex-row">
              <p className="text-center text-sm leading-loose text-muted-foreground">
                Running in browser with virtual Node.js
              </p>
            </div>
          </footer>
        </div>
      </div>
    </ConvexProvider>
  );
}
`);

  // Create home page (App Router) - Shows TaskList directly
  vfs.writeFileSync('/app/page.tsx', `"use client";

import React from 'react';
import { TaskList } from '../components/task-list.tsx';

export default function HomePage() {
  return (
    <div className="container py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Task Manager</h1>
        <p className="text-muted-foreground mt-2">
          Real-time sync powered by Convex - running in the browser!
        </p>
      </div>
      <TaskList />
    </div>
  );
}
`);

  // Create original home page content as a separate page (for reference)
  vfs.writeFileSync('/app/features/page.tsx', `import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Badge } from '../../components/ui/badge.tsx';

export default function FeaturesPage() {
  return (
    <div className="container py-10">
      {/* Feature Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              ⚡ React 18
            </CardTitle>
            <CardDescription>
              Latest React with Concurrent features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Using React 18 with automatic batching, Suspense,
              and concurrent rendering for optimal performance.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎨 shadcn/ui
            </CardTitle>
            <CardDescription>
              Beautiful, accessible components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Beautifully designed components built with Radix UI
              primitives and Tailwind CSS.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🔄 Convex (Mock)
            </CardTitle>
            <CardDescription>
              Real-time data sync simulation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Demonstrates the Convex pattern with useQuery and
              useMutation hooks using mock data.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🎯 TypeScript
            </CardTitle>
            <CardDescription>
              Full type safety
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Written in TypeScript with strict mode enabled
              for maximum type safety and developer experience.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              📱 Responsive
            </CardTitle>
            <CardDescription>
              Mobile-first design
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Fully responsive design that works great on any device,
              from mobile phones to desktop monitors.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🌐 Browser Runtime
            </CardTitle>
            <CardDescription>
              No server required
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Running entirely in the browser using virtual Node.js
              shims and Service Workers.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

  // Create features directory
  vfs.mkdirSync('/app/features', { recursive: true });

  // Create tasks page (App Router)
  vfs.writeFileSync('/app/tasks/page.tsx', `"use client";

import React from 'react';
import { TaskList } from '../../components/task-list.tsx';

export default function TasksPage() {
  return (
    <div className="container py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Task Manager</h1>
        <p className="text-muted-foreground mt-2">
          Add, complete, and manage your tasks
        </p>
      </div>
      <TaskList />
    </div>
  );
}
`);

  // Create about page (App Router)
  vfs.writeFileSync('/app/about/page.tsx', `import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Badge } from '../../components/ui/badge.tsx';

export default function AboutPage() {
  return (
    <div className="container py-10 max-w-3xl">
      <div className="mb-8">
        <Badge variant="outline" className="mb-4">About</Badge>
        <h1 className="text-3xl font-bold tracking-tight">How It Works</h1>
        <p className="text-muted-foreground mt-2">
          This demo showcases running a complex Next.js application entirely in the browser.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Virtual File System</CardTitle>
            <CardDescription>In-memory file system simulation</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm">
            <p>
              All project files exist in a virtual file system (VFS) in memory.
              This includes React components, configuration files, and even
              npm package contents.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Node.js Shims</CardTitle>
            <CardDescription>Browser-compatible Node.js APIs</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm">
            <p>
              Core Node.js modules like <code>fs</code>, <code>path</code>, <code>crypto</code>,
              <code>stream</code>, and <code>http</code> are shimmed to work in the browser
              using Web APIs.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>esbuild-wasm</CardTitle>
            <CardDescription>Fast JSX/TypeScript compilation</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm">
            <p>
              JSX and TypeScript files are transformed to JavaScript in real-time
              using esbuild-wasm, which runs WebAssembly in the browser.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Worker</CardTitle>
            <CardDescription>Request interception and routing</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm">
            <p>
              A Service Worker intercepts HTTP requests and routes them to the
              virtual dev server, enabling file-based routing without a real backend.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Convex Mock</CardTitle>
            <CardDescription>Simulated real-time database</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm">
            <p>
              The Convex client is mocked to demonstrate the pattern of using
              <code>useQuery</code> and <code>useMutation</code> hooks. In production,
              this would connect to a real Convex backend.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
`);

  // Create API route
  vfs.writeFileSync('/pages/api/health.js', `export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    runtime: 'browser-node-shim'
  });
}
`);

  // Create public files
  vfs.writeFileSync('/public/favicon.ico', 'favicon placeholder');
  vfs.writeFileSync('/public/robots.txt', 'User-agent: *\nAllow: /');
}

/**
 * Initialize the Convex App demo
 */
export async function initConvexAppDemo(
  outputElement: HTMLElement,
  options: {
    installPackages?: boolean;
  } = {}
): Promise<{ vfs: VirtualFS; runtime: Runtime }> {
  const log = (message: string) => {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    outputElement.appendChild(line);
    outputElement.scrollTop = outputElement.scrollHeight;
  };

  log('Creating virtual file system...');
  const vfs = new VirtualFS();

  log('Creating Convex App project structure...');
  createConvexAppProject(vfs);

  // Optionally install npm packages
  if (options.installPackages) {
    log('Installing npm packages (this may take a while)...');
    const npm = new PackageManager(vfs);

    for (const pkg of DEMO_PACKAGES) {
      try {
        log(`Installing ${pkg}...`);
        await npm.install(pkg, {
          onProgress: (msg) => log(`  ${msg}`),
        });
      } catch (error) {
        log(`Warning: Failed to install ${pkg}: ${error}`);
      }
    }
  }

  log('Initializing runtime...');
  const runtime = new Runtime(vfs, {
    cwd: '/',
    env: {
      NODE_ENV: 'development',
    },
    onConsole: (method, args) => {
      const prefix = method === 'error' ? '[ERROR]' : method === 'warn' ? '[WARN]' : '';
      log(`${prefix} ${args.map((a) => String(a)).join(' ')}`);
    },
  });

  log('Setting up file watcher...');
  vfs.watch('/app', { recursive: true }, (eventType, filename) => {
    log(`File ${eventType}: ${filename}`);
  });

  log('Convex App demo initialized!');
  log('');
  log('Project structure:');
  listFiles(vfs, '/', log, '  ');

  return { vfs, runtime };
}

/**
 * Start the dev server for Convex App demo
 */
export async function startConvexAppDevServer(
  vfs: VirtualFS,
  options: {
    port?: number;
    log?: (message: string) => void;
  } = {}
): Promise<{
  server: NextDevServer;
  url: string;
  stop: () => void;
}> {
  const port = options.port || 3002;
  const log = options.log || console.log;

  log('Starting Convex App dev server...');

  // Create NextDevServer with App Router preference
  const server = new NextDevServer(vfs, {
    port,
    root: '/',
    preferAppRouter: true,
  });

  // Get the server bridge
  const bridge = getServerBridge();

  // Initialize Service Worker
  try {
    log('Initializing Service Worker...');
    await bridge.initServiceWorker();
    log('Service Worker ready');
  } catch (error) {
    log(`Warning: Service Worker failed to initialize: ${error}`);
    log('Falling back to direct request handling...');
  }

  // Register event handlers
  bridge.on('server-ready', (p: unknown, u: unknown) => {
    log(`Server ready at ${u}`);
  });

  // Wire up the NextDevServer to handle requests through the bridge
  const httpServer = createHttpServerWrapper(server);
  bridge.registerServer(httpServer, port);

  // Start watching for file changes
  server.start();
  log('File watcher started');

  // Set up HMR event forwarding
  server.on('hmr-update', (update: unknown) => {
    log(`HMR update: ${JSON.stringify(update)}`);
  });

  const url = bridge.getServerUrl(port);
  log(`Convex App dev server running at: ${url}/`);

  return {
    server,
    url: url + '/',
    stop: () => {
      server.stop();
      bridge.unregisterServer(port);
    },
  };
}

/**
 * Create an http.Server-compatible wrapper
 */
function createHttpServerWrapper(devServer: NextDevServer) {
  return {
    listening: true,
    address: () => ({ port: devServer.getPort(), address: '0.0.0.0', family: 'IPv4' }),
    async handleRequest(
      method: string,
      url: string,
      headers: Record<string, string>,
      body?: string | Buffer
    ) {
      const bodyBuffer = body
        ? typeof body === 'string'
          ? Buffer.from(body)
          : body
        : undefined;
      return devServer.handleRequest(method, url, headers, bodyBuffer);
    },
  };
}

function listFiles(
  vfs: VirtualFS,
  path: string,
  log: (msg: string) => void,
  indent: string
): void {
  try {
    const entries = vfs.readdirSync(path);
    for (const entry of entries) {
      if (entry === 'node_modules') {
        log(`${indent}${entry}/ (skipped)`);
        continue;
      }
      const fullPath = path === '/' ? `/${entry}` : `${path}/${entry}`;
      try {
        const stat = vfs.statSync(fullPath);
        if (stat.isDirectory()) {
          log(`${indent}${entry}/`);
          listFiles(vfs, fullPath, log, indent + '  ');
        } else {
          log(`${indent}${entry}`);
        }
      } catch {
        log(`${indent}${entry}`);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
}

// Export for use in HTML demos
export { PACKAGE_JSON, DEMO_PACKAGES };
