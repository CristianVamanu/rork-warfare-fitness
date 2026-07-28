'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Mail, Lock, User, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { signUp } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  sex: z.enum(['male', 'female'], { errorMap: () => ({ message: 'Select male or female' }) }),
  age: z.coerce.number({ invalid_type_error: 'Enter your age' }).int().min(13, 'Must be 13 or older').max(100, 'Enter a valid age'),
  weightUnit: z.enum(['kg', 'lbs']),
  acceptedTerms: z.boolean().refine(v => v === true, 'You must accept the Terms & Conditions'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { weightUnit: 'kg', acceptedTerms: false },
  });

  const weightUnit = watch('weightUnit');
  const sex = watch('sex');

  const onSubmit = async (data: FormData) => {
    console.log('[Register] Sign-up requested — email:', data.email, 'name:', data.name, 'unit:', data.weightUnit);
    setLoading(true);
    try {
      console.log('[Register] Calling signUp...');
      await signUp(data.email, data.password, data.name, data.weightUnit);
      // Straight into the same onboarding quiz the landing page funnels
      // into (goal/experience/program/etc) instead of dumping the user on
      // an empty dashboard with no program, no goals, nothing — sex/age
      // ride along as query params exactly like the landing page's
      // quick-start box, so onboarding doesn't ask for them a second time.
      console.log('[Register] signUp succeeded — continuing to onboarding');
      router.replace(`/onboarding?sex=${data.sex}&age=${data.age}`);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      console.error('[Register] Sign-up FAILED:', {
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
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center mb-4 shadow-glow-accent">
          <span className="text-2xl font-black text-black">W</span>
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">Create Your Account</h1>
        <p className="text-text-secondary text-sm mt-1">Start your fitness journey</p>
      </div>

      <Card glass className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="John Doe"
            leftIcon={<User className="w-4 h-4" />}
            error={errors.name?.message}
            {...register('name')}
          />
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
          <Input
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">Sex</label>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map((value) => (
                <label
                  key={value}
                  className={`flex items-center justify-center py-2.5 rounded-xl border cursor-pointer transition-all ${
                    sex === value
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-white/10 bg-surface-elevated text-text-secondary'
                  }`}
                >
                  <input type="radio" value={value} className="sr-only" {...register('sex')} />
                  <span className="text-sm font-medium capitalize">{value}</span>
                </label>
              ))}
            </div>
            {errors.sex && <p className="text-xs text-danger mt-1.5">{errors.sex.message}</p>}
          </div>

          <Input
            label="Age"
            type="number"
            placeholder="28"
            error={errors.age?.message}
            {...register('age')}
          />

          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Weight Unit
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['kg', 'lbs'] as const).map((unit) => (
                <label
                  key={unit}
                  className={`flex items-center justify-center py-2.5 rounded-xl border cursor-pointer transition-all ${
                    weightUnit === unit
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-white/10 bg-surface-elevated text-text-secondary'
                  }`}
                >
                  <input type="radio" value={unit} className="sr-only" {...register('weightUnit')} />
                  <span className="text-sm font-medium">{unit.toUpperCase()}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl text-xs text-yellow-400/80 leading-relaxed">
            <p className="font-bold mb-1 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Health Disclaimer</p>
            By registering you acknowledge that all workouts and nutrition advice are for informational purposes only. Always consult a qualified physician before starting any exercise program. You use this platform entirely at your own risk. The trainer / platform owner accepts no liability for any injury, illness, or adverse outcome.
          </div>

          {/* Terms checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 w-4 h-4 rounded accent-lime-400 flex-shrink-0"
              {...register('acceptedTerms')}
            />
            <span className="text-xs text-text-secondary leading-relaxed">
              I have read and agree to the{' '}
              <Link href="/terms" target="_blank" className="text-accent hover:underline">Terms & Conditions</Link>
              {' '}and{' '}
              <Link href="/privacy" target="_blank" className="text-accent hover:underline">Privacy Policy</Link>
              , including the health disclaimer above.
            </span>
          </label>
          {errors.acceptedTerms && (
            <p className="text-xs text-danger">{errors.acceptedTerms.message}</p>
          )}

          <Button type="submit" fullWidth loading={loading} size="lg">
            Create Account
          </Button>
        </form>
      </Card>

      <p className="text-center text-sm text-text-secondary mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-accent font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </motion.div>
  );
}
