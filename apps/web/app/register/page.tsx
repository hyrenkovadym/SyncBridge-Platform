import { AuthForm } from '../../components/auth-form';

export default function RegisterPage() {
  return (
    <AuthForm
      title="Register"
      subtitle="Create a new internal account for SyncBridge."
      buttonLabel="Create Account"
      fields={[
        { id: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Jane Operator' },
        { id: 'email', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
        { id: 'password', label: 'Password', type: 'password', placeholder: 'Minimum 8 characters' },
      ]}
    />
  );
}
