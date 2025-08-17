"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../../src/lib/utils";
import { Button } from "./button";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/marketing", label: "Marketing" },
  { href: "/chatting", label: "Chatting" },
  { href: "/learn", label: "Learn" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/" className="font-bold text-xl">
              OFM Social OS
            </Link>
            <div className="hidden md:flex space-x-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-blue-600",
                    pathname === item.href ? "text-blue-600" : "text-gray-600"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <Button asChild>
            <Link href="/join">Get invite</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}