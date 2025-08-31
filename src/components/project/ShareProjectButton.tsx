// src/components/project/ShareProjectButton.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ShareIcon } from "../common/Icons";

interface ShareProjectButtonProps {
	className?: string;
	projectName: string;
	shareUrl: string;
	onOpenShareModal: () => void;
}

const ShareProjectButton: React.FC<ShareProjectButtonProps> = ({
	className = "",
	projectName,
	shareUrl,
	onOpenShareModal,
}) => {
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsDropdownOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const handleShareClick = () => {
		onOpenShareModal();
		setIsDropdownOpen(false);
	};

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	return (
		<div className={`share-project-buttons ${className}`} ref={dropdownRef}>
			<div className="share-button-group">
				<button
					className="share-button main-button"
					onClick={handleShareClick}
					title="Share Project"
				>
					<ShareIcon />
				</button>
				<button
					className="share-button dropdown-toggle"
					onClick={toggleDropdown}
					title="Share Options"
				>
					<ChevronDownIcon />
				</button>
			</div>
			{isDropdownOpen && (
				<div className="share-dropdown">
					<div className="share-dropdown-item" onClick={handleShareClick}>
						<ShareIcon />
						<span>Share with Link</span>
					</div>
					<div className="share-dropdown-item disabled">
						<span>Publish to Journal</span>
						<span className="coming-soon">(Coming Soon)</span>
					</div>
					<div className="share-dropdown-item disabled">
						<span>Share Template</span>
						<span className="coming-soon">(Coming Soon)</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default ShareProjectButton;
