'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthForm } from '../../components/auth-form';
import { ApiError, api } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: Record<string, string>) => {
    setErrorMessage(undefined);
    setIsSubmitting(true);
    try {
      await api.register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unexpected error while creating account.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthForm
      title="Register"
      subtitle="Create a new internal account for SyncBridge."
      buttonLabel="Create Account"
      onSubmit={handleSubmit}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      footerNote="Demo mode stores tokens in localStorage."
      fields={[
        { id: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Jane Operator' },
        { id: 'email', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
        { id: 'password', label: 'Password', type: 'password', placeholder: 'Minimum 8 characters' },
      ]}
    />
  );
}
