import { AuthForm } from '../../components/auth-form';

export default function LoginPage() {
  return (
    <AuthForm
      title="Login"
      subtitle="Use your SyncBridge account credentials."
      buttonLabel="Login"
      fields={[
        { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
        { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
      ]}
    />
  );
}
