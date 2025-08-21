// src/components/profile/UserDropdown.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { UserIcon } from "../common/Icons";

interface UserDropdownProps {
	username: string;
	onLogout: () => void;
	onOpenProfile: () => void;
	onOpenExport: () => void;
	onOpenDeleteAccount: () => void;
	isGuest?: boolean;
}

const UserDropdown: React.FC<UserDropdownProps> = ({
	username,
	onLogout,
	onOpenProfile,
	onOpenExport,
	onOpenDeleteAccount,
	isGuest = false,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const displayUsername = isGuest ? "Guest User" : username;

	return (
		<div className="user-dropdown-container" ref={dropdownRef}>
			<button
				className={`user-dropdown-button ${isGuest ? 'guest' : ''}`}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				<UserIcon />
				<span>{displayUsername}</span>
			</button>

			{isOpen && (
				<div className="user-dropdown-menu">
					{!isGuest && (
						<>
							<button
								className="dropdown-item"
								onClick={() => {
									setIsOpen(false);
									onOpenProfile();
								}}
							>
								Profile Settings
							</button>
							<button
								className="dropdown-item"
								onClick={() => {
									setIsOpen(false);
									onOpenExport();
								}}
							>
								Export Account
							</button>
							<div className="dropdown-separator" />
							<button
								className="dropdown-item danger"
								onClick={() => {
									setIsOpen(false);
									onOpenDeleteAccount();
								}}
							>
								Delete Account
							</button>
						</>
					)}
					<button
						className="dropdown-item"
						onClick={() => {
							setIsOpen(false);
							onLogout();
						}}
					>
						{isGuest ? "End Session" : "Logout"}
					</button>
				</div>
			)}
		</div>
	);
};

export default UserDropdown;