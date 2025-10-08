import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import Modal from '@src/components/common/Modal';

describe('Modal Component', () => {
    it('should not render when closed', () => {
        render(
            <Modal isOpen={false} onClose={jest.fn()} title="Test Modal">
                <div>Modal content</div>
            </Modal>
        );

        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    });

    it('should render when open', () => {
        render(
            <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
                <div>Modal content</div>
            </Modal>
        );

        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('should call onClose when clicking close button', async () => {
        const user = userEvent.setup();
        const onClose = jest.fn();

        render(
            <Modal isOpen={true} onClose={onClose} title="Test Modal">
                <div>Modal content</div>
            </Modal>
        );

        const closeButton = screen.getByRole('button');

        await act(async () => {
            await user.click(closeButton);
        });

        expect(onClose).toHaveBeenCalled();
    });

    it('should render different sizes', () => {
        const { rerender, container } = render(
            <Modal isOpen={true} onClose={jest.fn()} title="Test Modal" size="small">
                <div>Content</div>
            </Modal>
        );

        expect(container.querySelector('.modal-small')).toBeInTheDocument();

        rerender(
            <Modal isOpen={true} onClose={jest.fn()} title="Test Modal" size="large">
                <div>Content</div>
            </Modal>
        );

        expect(container.querySelector('.modal-large')).toBeInTheDocument();
    });
});