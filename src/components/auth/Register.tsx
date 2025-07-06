// src/components/auth/Register.tsx
import type React from "react";
import { useState } from "react";

import { useAuth } from "../../hooks/useAuth.ts";

interface RegisterProps {
	onRegisterSuccess: () => void;
	onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({
	onRegisterSuccess,
	onSwitchToLogin,
}) => {
	const { register } = useAuth();

	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const validateEmail = (email: string): boolean => {
		// Basic email validation
		return /\S+@\S+\.\S+/.test(email);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validation
		if (!username || !password) {
			setError("Please fill out all required fields");
			return;
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		if (password.length < 6) {
			setError("Password must be at least 6 characters long");
			return;
		}

		if (email && !validateEmail(email)) {
			setError("Please enter a valid email address");
			return;
		}

		setError(null);
		setIsLoading(true);

		try {
			await register(username, password, email || undefined);
			onRegisterSuccess();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "An error occurred during registration",
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="auth-form-container">
			<h2>Create an Account</h2>

			{error && <div className="auth-error">{error}</div>}

			<form onSubmit={handleSubmit} className="auth-form">
				<div className="form-group">
					<label htmlFor="username">
						Username <span className="required">*</span>
					</label>
					<input
						type="text"
						id="username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						disabled={isLoading}
						autoComplete="username"
						required
					/>
				</div>

				<div className="form-group">
					<label htmlFor="email">Email</label>
					<input
						type="email"
						id="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={isLoading}
						autoComplete="email"
					/>
				</div>

				<div className="form-group">
					<label htmlFor="password">
						Password <span className="required">*</span>
					</label>
					<input
						type="password"
						id="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={isLoading}
						autoComplete="new-password"
						required
					/>
				</div>

				<div className="form-group">
					<label htmlFor="confirmPassword">
						Confirm Password <span className="required">*</span>
					</label>
					<input
						type="password"
						id="confirmPassword"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						disabled={isLoading}
						autoComplete="new-password"
						required
					/>
				</div>

				<button
					type="submit"
					className={`auth-button ${isLoading ? "loading" : ""}`}
					disabled={isLoading}
				>
					{isLoading ? "Creating Account..." : "Sign Up"}
				</button>
			</form>

			<div className="auth-alt-action">
				<span>Already have an account?</span>
				<button
					className="text-button"
					onClick={onSwitchToLogin}
					disabled={isLoading}
				>
					Login
				</button>
			</div>
		</div>
	);
};

export default Register;
