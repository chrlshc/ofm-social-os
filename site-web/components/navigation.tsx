'use client';

import Link from 'next/link';
import { Button } from './ui/button';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-8">
        <Link
          href="/pricing"
          className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
        >
          Pricing
        </Link>
        <Link
          href="/#solutions"
          className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
        >
          Features
        </Link>
        <Link
          href="/#testimonials"
          className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
        >
          Success Stories
        </Link>
        <Link
          href="/#about"
          className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
        >
          About
        </Link>
        <Button asChild className="btn-primary">
          <Link href="/join">Get Early Access</Link>
        </Button>
      </nav>
      
      {/* Mobile Menu Button */}
      <button
        className="md:hidden text-gray-700"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Toggle menu"
      >
        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>
      
      {/* Mobile Navigation */}
      {isMenuOpen && (
        <nav className="md:hidden absolute top-full left-0 right-0 bg-white border-b shadow-lg">
          <div className="flex flex-col p-6 space-y-4">
            <Link
              href="/pricing"
              className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/#solutions"
              className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="/#testimonials"
              className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              Success Stories
            </Link>
            <Link
              href="/#about"
              className="text-gray-700 hover:text-purple-600 transition-colors font-medium"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </Link>
            <Button asChild className="btn-primary w-full">
              <Link href="/join">Get Early Access</Link>
            </Button>
          </div>
        </nav>
      )}
    </>
  );
}