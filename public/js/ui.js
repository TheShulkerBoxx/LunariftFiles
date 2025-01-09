/**
 * UI Utilities Module
 * Handles notifications, modals, and formatting
 */

const UI = {
    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    },

    /**
     * Show confirmation dialog
     */
    async showConfirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 class="text-xl font-bold mb-4 text-white">${title}</h3>
                    <p class="text-slate-300 mb-6">${message}</p>
                    <div class="flex gap-3">
                        <button class="confirm-btn flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-500 transition">
                            Confirm
                        </button>
                        <button class="cancel-btn flex-1 bg-slate-700 text-white py-2 px-4 rounded-lg hover:bg-slate-600 transition">
                            Cancel
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('.confirm-btn').onclick = () => {
                modal.remove();
                resolve(true);
            };

            modal.querySelector('.cancel-btn').onclick = () => {
                modal.remove();
                resolve(false);
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            };
        });
    },

    /**
     * Show prompt dialog
     */
    async showPrompt(title, defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3 class="text-xl font-bold mb-4 text-white">${title}</h3>
                    <input type="text" class="prompt-input w-full bg-slate-900 border border-slate-700 p-3 rounded-lg outline-none focus:border-blue-500 text-white mb-6" value="${defaultValue}">
                    <div class="flex gap-3">
                        <button class="ok-btn flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-500 transition">
                            OK
                        </button>
                        <button class="cancel-btn flex-1 bg-slate-700 text-white py-2 px-4 rounded-lg hover:bg-slate-600 transition">
                            Cancel
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const input = modal.querySelector('.prompt-input');
            input.focus();
            input.select();

            const submit = () => {
                const value = input.value.trim();
                modal.remove();
                resolve(value || null);
            };

            modal.querySelector('.ok-btn').onclick = submit;
            input.onkeydown = (e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') {
                    modal.remove();
                    resolve(null);
                }
            };

            modal.querySelector('.cancel-btn').onclick = () => {
                modal.remove();
                resolve(null);
            };

            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            };
        });
    },

    /**
     * Format bytes to human readable (decimal/SI units)
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1000; // Decimal (SI) units to match OS/drive manufacturers
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Format speed (bytes per second)
     */
    formatSpeed(bytesPerSecond) {
        return this.formatBytes(bytesPerSecond) + '/s';
    },

    /**
     * Format date
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Show loading spinner
     */
    showLoading(text = 'Loading...') {
        const spinner = document.createElement('div');
        spinner.className = 'loading-overlay';
        spinner.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p class="mt-4 text-white">${text}</p>
            </div>
        `;
        document.body.appendChild(spinner);
        return spinner;
    },

    /**
     * Hide loading spinner
     */
    hideLoading(spinner) {
        if (spinner && spinner.parentNode) {
            spinner.remove();
        }
    }
};
