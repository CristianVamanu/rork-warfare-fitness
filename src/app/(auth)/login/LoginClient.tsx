'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signIn } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginClient({
  initialAppName,
  initialLogoUrl,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [appName] = useState(initialAppName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    console.log('[Login] Sign-in requested for:', data.email);
    setLoading(true);
    try {
      console.log('[Login] Calling signIn...');
      await signIn(data.email, data.password);
      console.log('[Login] signIn succeeded — navigating to /dashboard');
      router.replace('/dashboard');
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      console.error('[Login] Sign-in FAILED:', {
        code: e?.code,
        message: e?.message,
        stack: e?.stack,
      });
      // Show the real Firebase error code + message — never hide it
      const display = e?.code
        ? `${e.code}: ${e.message}`
        : (e?.message || String(err));
      toast.error(display, { duration: 8000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Logo — links back to the public homepage */}
      <Link href="/" className="flex flex-col items-center mb-8">
        <div className={`w-24 h-24 rounded-2xl flex items-center justify-center mb-4 shadow-glow-accent overflow-hidden ${logoUrl ? '' : 'bg-accent'}`}>
          {logoUrl ? (
            <Image src={logoUrl} alt={appName} width={96} height={96} className="w-full h-full object-cover" onError={() => setLogoUrl(null)} />
          ) : (
            <span className="text-2xl font-black text-black">{appName[0]}</span>
          )}
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">{appName}</h1>
        <p className="text-text-secondary text-sm mt-1">Welcome back</p>
      </Link>

      <Card glass className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            rightIcon={
              <button type="button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth loading={loading} size="lg">
            Sign In
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-text-secondary mt-6">
        New here?{' '}
        <Link href="/onboarding" className="text-accent font-medium hover:underline">
          Create account
        </Link>
      </p>
    </motion.div>
  );
}
