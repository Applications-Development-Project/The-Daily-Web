/**
 * public/js/shared/confirmDialog.js
 *
 * A shared confirm dialog built on the HTML5 <dialog> element.
 * Replaces window.confirm() with a custom UI.
 *
 * Owner: SH.
 */

let dialogElement = null;
let dialogResolve = null;

/**
 * Shows a confirmation dialog and waits for the user's choice.
 *
 * Defense question: "Is this a security check?"
 * No. It protects the user from a mistake; every permission is still checked on the server.
 *
 * @param {string} message - The message to display (supports \n\n for paragraphs).
 * @param {string} confirmLabel - The text for the confirm button (e.g., 'Delete', 'Publish').
 * @returns {Promise<boolean>} True if confirmed, false otherwise.
 */
function showConfirmDialog(message, confirmLabel) {
    return new Promise((resolve) => {
        if (!dialogElement) {
            dialogElement = document.createElement('dialog');
            // We reuse the 'card' class for the background, border, and shadow
            dialogElement.className = 'card confirm-dialog'; 

            const messagePara = document.createElement('p');
            messagePara.className = 'confirm-message';

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'confirm-actions';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary cancel-btn';
            cancelBtn.textContent = 'Cancel';
            
            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'btn confirm-btn';

            actionsDiv.append(cancelBtn, confirmBtn);
            dialogElement.append(messagePara, actionsDiv);
            document.body.append(dialogElement);

            cancelBtn.addEventListener('click', () => {
                dialogElement.close('cancel');
            });

            confirmBtn.addEventListener('click', () => {
                dialogElement.close('confirm');
            });

            // Resolves on Confirm, Cancel, or Escape (which triggers the close event natively)
            dialogElement.addEventListener('close', () => {
                const isConfirmed = dialogElement.returnValue === 'confirm';
                dialogElement.returnValue = ''; // Reset for next time
                if (dialogResolve) {
                    dialogResolve(isConfirmed);
                    dialogResolve = null;
                }
            });
        }

        const messagePara = dialogElement.querySelector('.confirm-message');
        const confirmBtn = dialogElement.querySelector('.confirm-btn');

        messagePara.textContent = message;
        confirmBtn.textContent = confirmLabel;

        // The Confirm button uses btn-danger for deletes and btn-primary for publish
        if (confirmLabel.toLowerCase().includes('delete')) {
            confirmBtn.className = 'btn btn-danger confirm-btn';
        } else {
            confirmBtn.className = 'btn btn-primary confirm-btn';
        }

        dialogResolve = resolve;
        dialogElement.showModal();
    });
}