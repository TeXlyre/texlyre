// src/components/profile/UserDropdown.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { UserIcon } from "../common/Icons";

interface UserDropdownProps {
	username: string;
	onLogout: () => void;
	onOpenProfile: () => void;
	onOpenExport: () => void;
}

const UserDropdown: React.FC<UserDropdownProps> = ({
	username,
	onLogout,
	onOpenProfile,
	onOpenExport,
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

	return (
		<div className="user-dropdown-container" ref={dropdownRef}>
			<button
				className="user-dropdown-button"
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				<UserIcon />
				<span>{username}</span>
			</button>

			{isOpen && (
				<div className="user-dropdown-menu">
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
					<button
						className="dropdown-item"
						onClick={() => {
							setIsOpen(false);
							onLogout();
						}}
					>
						Logout
					</button>
				</div>
			)}
		</div>
	);
};

export default UserDropdown;
