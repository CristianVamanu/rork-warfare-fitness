'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { resetPassword } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { AuthBrandMark } from '@/components/auth/AuthBrandMark';

const schema = z.object({
  email: z.string().email('Invalid email'),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordClient({
  initialAppName,
  initialLogoUrl,
}: {
  initialAppName: string;
  initialLogoUrl: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // appName/logoUrl are no longer read here — AuthBrandMark carries the
  // brand video. The props stay so the server page's signature is unchanged.

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await resetPassword(data.email);
      setSent(true);
    } catch {
      toast.error('Failed to send reset email');
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
      <AuthBrandMark title="Reset Password" subtitle="We'll send you a reset link" />

      <Card glass className="p-6">
        {sent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-4"
          >
            <CheckCircle className="w-14 h-14 text-success mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white mb-2">Email Sent!</h2>
            <p className="text-text-secondary text-sm">
              Check your inbox for the password reset link.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              leftIcon={<Mail className="w-4 h-4" />}
              error={errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" fullWidth loading={loading} size="lg">
              Send Reset Link
            </Button>
          </form>
        )}
      </Card>

      <div className="flex justify-center mt-6">
        <Link href="/login" className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-white">
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>
      </div>
    </motion.div>
  );
}
