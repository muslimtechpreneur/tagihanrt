
        document.addEventListener('DOMContentLoaded', function() {
            // Namespace untuk aplikasi
            const App = {
                db: null,
                currentPage: 'dashboardPage',
                paymentChart: null,
                settings: {
                    darkMode: false,
                    businessName: 'Tagihan Internet',
                    businessLogo: null,
                    whatsappMessage: 'Yth. [Nama],\n\nKami informasikan tagihan internet Anda untuk periode [Bulan] [Tahun] sebesar [Jumlah].\nStatus: [Status].\n\nTerima kasih.',
                    lastBillGeneration: null, // Format: 'YYYY-MM'
                },
                confirmationCallback: null,

                // Inisialisasi utama
                init() {
                    this.initDB();
                    this.attachEventListeners();
                },

                // Setup IndexedDB
                initDB() {
                    // Menaikkan versi DB untuk memicu onupgradeneeded
                    const request = indexedDB.open('TagihanInternetDB_v3', 3);

                    request.onerror = (e) => {
                        console.error('Database error:', e.target.error);
                        this.showToast('Gagal memuat database', 'error');
                    };

                    request.onsuccess = (e) => {
                        this.db = e.target.result;
                        this.loadSettings().then(() => {
                            this.render();
                            this.checkAndPromptForBillGeneration();
                        });
                    };

                    request.onupgradeneeded = (e) => {
                        this.db = e.target.result;
                        if (!this.db.objectStoreNames.contains('customers')) {
                            this.db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
                        }
                        if (!this.db.objectStoreNames.contains('bills')) {
                            const billsStore = this.db.createObjectStore('bills', { keyPath: 'id', autoIncrement: true });
                            billsStore.createIndex('customerId_period', ['customerId', 'period'], { unique: true });
                        }
                        if (!this.db.objectStoreNames.contains('settings')) {
                            this.db.createObjectStore('settings', { keyPath: 'key' });
                        }
                        // Menambahkan object store baru untuk paket
                        if (!this.db.objectStoreNames.contains('packages')) {
                            this.db.createObjectStore('packages', { keyPath: 'id', autoIncrement: true });
                        }
                    };
                },

                // Render halaman sesuai state
                async render() {
                    const pageId = this.currentPage;
                    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                    document.getElementById(pageId).classList.add('active');

                    document.querySelectorAll('.nav-item').forEach(item => {
                        item.classList.toggle('active', item.dataset.page === pageId);
                    });
                    
                    this.populateDateFilters();

                    switch (pageId) {
                        case 'dashboardPage': await this.renderDashboard(); break;
                        case 'customersPage': await this.renderCustomers(); break;
                        case 'billsPage': await this.renderBills(); break;
                        case 'reportsPage': await this.renderReports(); break;
                        case 'settingsPage': await this.renderSettings(); break;
                    }
                },

                // Kumpulan Event Listener
                attachEventListeners() {
                    // Navigasi
                    document.querySelector('.bottom-nav').addEventListener('click', e => {
                        const navItem = e.target.closest('.nav-item');
                        if (navItem) {
                            this.currentPage = navItem.dataset.page;
                            this.render();
                        }
                    });

                    // Tombol refresh
                    document.getElementById('refreshBtn').addEventListener('click', e => {
                        e.currentTarget.querySelector('i').classList.add('fa-spin');
                        this.render().then(() => {
                            setTimeout(() => e.currentTarget.querySelector('i').classList.remove('fa-spin'), 500);
                            this.showToast('Data berhasil disegarkan', 'success');
                        });
                    });
                    
                    // Event listener untuk modal close
                    document.querySelectorAll('.modal-close').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                           e.target.closest('.modal').classList.remove('active');
                        });
                    });

                    // Pelanggan
                    document.getElementById('addCustomerBtn').addEventListener('click', () => this.showCustomerModal());
                    document.getElementById('saveCustomerBtn').addEventListener('click', () => this.saveCustomer());
                    document.getElementById('customerSearch').addEventListener('input', (e) => this.filterTable('customersTableBody', e.target.value));
                    document.getElementById('customerPackage').addEventListener('change', (e) => this.updateCustomerFeeFromPackage(e.target));

                    // Tagihan
                    document.getElementById('filterBillsBtn').addEventListener('click', () => this.renderBills());
                    document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
                        document.querySelectorAll('#billsTableBody .bill-checkbox').forEach(cb => cb.checked = e.target.checked);
                    });
                    document.getElementById('markAsPaidBtn').addEventListener('click', () => this.updateSelectedBillsStatus('Lunas'));
                    document.getElementById('markAsUnpaidBtn').addEventListener('click', () => this.updateSelectedBillsStatus('Belum Lunas'));
                    document.getElementById('generateBillsBtn').addEventListener('click', () => this.generateBillsForCurrentMonth());
                    document.getElementById('broadcastBtn').addEventListener('click', () => this.broadcastBills());
                    document.getElementById('shareReceiptBtn').addEventListener('click', (e) => this.shareReceipt(e.currentTarget));

                    
                    // Laporan
                    document.getElementById('filterReportBtn').addEventListener('click', () => this.renderReports());
                    document.getElementById('exportReportBtn').addEventListener('click', () => this.exportTableToCSV('reportTable', 'laporan.csv'));

                    // Pengaturan
                    document.getElementById('saveBusinessInfoBtn').addEventListener('click', (e) => this.saveBusinessInfo(e.currentTarget));
                    document.getElementById('saveAppSettingsBtn').addEventListener('click', (e) => this.saveAppSettings(e.currentTarget));
                    document.getElementById('darkModeToggle').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
                    document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
                    document.getElementById('backupDataBtn').addEventListener('click', () => this.backupData());
                    document.getElementById('restoreDataInput').addEventListener('change', (e) => this.restoreData(e));
                    
                    // CRUD Paket
                    document.getElementById('addPackageBtn').addEventListener('click', () => this.showPackageModal());
                    document.getElementById('savePackageBtn').addEventListener('click', () => this.savePackage());
                    
                    // Impor Pelanggan
                    document.getElementById('importCustomersBtn').addEventListener('click', () => this.showImportModal());
                    document.getElementById('downloadTemplateBtn').addEventListener('click', () => this.downloadImportTemplate());
                    document.getElementById('importCustomerFileInput').addEventListener('change', e => {
                        const file = e.target.files[0];
                        document.getElementById('xlsxFileName').textContent = file ? file.name : '';
                    });
                    document.getElementById('processImportBtn').addEventListener('click', () => this.processImport());


                    // Konfirmasi Modal
                    document.getElementById('cancelConfirmationBtn').addEventListener('click', () => document.getElementById('confirmationModal').classList.remove('active'));
                    document.getElementById('confirmActionBtn').addEventListener('click', () => {
                        if (this.confirmationCallback) this.confirmationCallback();
                        document.getElementById('confirmationModal').classList.remove('active');
                    });
                },

                // --- FUNGSI HELPER ---
                showToast(message, type = 'info') {
                    const container = document.getElementById('toastContainer');
                    const toast = document.createElement('div');
                    toast.className = `toast ${type}`;
                    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
                    toast.innerHTML = `<i class="fas ${icon} toast-icon"></i><span>${message}</span>`;
                    container.appendChild(toast);
                    setTimeout(() => toast.remove(), 4000);
                },

                showConfirmation(title, message, callback) {
                    document.getElementById('confirmationTitle').textContent = title;
                    document.getElementById('confirmationMessage').innerHTML = message;
                    this.confirmationCallback = callback;
                    document.getElementById('confirmationModal').classList.add('active');
                },
                
                formatCurrency(amount) {
                    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
                },

                formatDate(isoString) {
                    return new Date(isoString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
                },
                
                getMonthName(monthIndex) { // 0-11
                    return ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][monthIndex];
                },
                
                populateDateFilters() {
                    ['billMonth', 'reportMonth'].forEach(id => {
                        const select = document.getElementById(id);
                        if (select.options.length > 1) return;
                        select.innerHTML = '';
                        for (let i = 0; i < 12; i++) {
                            select.add(new Option(this.getMonthName(i), i));
                        }
                        select.value = new Date().getMonth();
                    });
                    ['billYear', 'reportYear'].forEach(id => {
                        const select = document.getElementById(id);
                        if (select.options.length > 1) return;
                        select.innerHTML = '';
                        const currentYear = new Date().getFullYear();
                        for (let i = 0; i < 5; i++) {
                            select.add(new Option(currentYear - i, currentYear - i));
                        }
                    });
                },

                filterTable(tableBodyId, searchTerm) {
                    const term = searchTerm.toLowerCase();
                    document.querySelectorAll(`#${tableBodyId} tr`).forEach(row => {
                        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
                    });
                },
                
                // --- FUNGSI DB TRANSACTION ---
                async transaction(storeNames, mode, callback) {
                    return new Promise((resolve, reject) => {
                        const tx = this.db.transaction(storeNames, mode);
                        tx.oncomplete = () => resolve();
                        tx.onerror = (e) => reject(e.target.error);
                        callback(tx);
                    });
                },

                async getAll(storeName) {
                    return new Promise((resolve, reject) => {
                        const tx = this.db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        const request = store.getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                },
                
                async getById(storeName, id) {
                    return new Promise((resolve, reject) => {
                        const tx = this.db.transaction(storeName, 'readonly');
                        const store = tx.objectStore(storeName);
                        const request = store.get(id);
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    });
                },
                
                // --- DASHBOARD ---
                async renderDashboard() {
                    const customers = await this.getAll('customers');
                    const bills = await this.getAll('bills');
                    const now = new Date();
                    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    
                    const currentMonthBills = bills.filter(b => b.period === currentPeriod);
                    const paidBills = currentMonthBills.filter(b => b.status === 'Lunas');
                    const monthlyIncome = paidBills.reduce((sum, b) => sum + b.amount, 0);
                    const paymentPercentage = currentMonthBills.length > 0 ? Math.round((paidBills.length / currentMonthBills.length) * 100) : 0;

                    document.getElementById('totalCustomers').textContent = customers.length;
                    document.getElementById('currentMonthBills').textContent = currentMonthBills.length;
                    document.getElementById('monthlyIncome').textContent = this.formatCurrency(monthlyIncome);
                    document.getElementById('paymentStatus').textContent = `${paymentPercentage}%`;

                    this.renderPaymentChart(paidBills.length, currentMonthBills.length - paidBills.length);
                },

                renderPaymentChart(paid, unpaid) {
                    const ctx = document.getElementById('paymentChart').getContext('2d');
                    if (this.paymentChart) this.paymentChart.destroy();
                    this.paymentChart = new Chart(ctx, {
                        type: 'pie',
                        data: {
                            labels: ['Lunas', 'Belum Lunas'],
                            datasets: [{
                                data: [paid, unpaid],
                                backgroundColor: ['#198754', '#dc3545'],
                                borderColor: [this.settings.darkMode ? '#343a40' : '#ffffff'],
                                borderWidth: 2,
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'bottom', labels: { color: this.settings.darkMode ? '#f8f9fa' : '#212529' } },
                                title: { display: true, text: 'Status Pembayaran Bulan Ini', color: this.settings.darkMode ? '#f8f9fa' : '#212529' }
                            }
                        }
                    });
                },

                // --- PELANGGAN ---
                async renderCustomers() {
                    const customers = await this.getAll('customers');
                    const tbody = document.getElementById('customersTableBody');
                    tbody.innerHTML = '';
                    customers.forEach(c => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${c.name}</td>
                            <td>${c.whatsapp}</td>
                            <td>${c.package}</td>
                            <td>${this.formatCurrency(c.fee)}</td>
                            <td class="table-actions">
                                <button class="table-btn edit" data-id="${c.id}" title="Edit"><i class="fas fa-edit"></i></button>
                                <button class="table-btn delete" data-id="${c.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                                <button class="table-btn history" data-id="${c.id}" title="Histori"><i class="fas fa-history"></i></button>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });

                    tbody.querySelectorAll('.edit').forEach(b => b.addEventListener('click', e => this.showCustomerModal(e.currentTarget.dataset.id)));
                    tbody.querySelectorAll('.delete').forEach(b => b.addEventListener('click', e => this.deleteCustomer(e.currentTarget.dataset.id)));
                    tbody.querySelectorAll('.history').forEach(b => b.addEventListener('click', e => this.showBillHistory(e.currentTarget.dataset.id)));
                },

                async showCustomerModal(id = null) {
                    const form = document.getElementById('customerForm');
                    form.reset();
                    document.getElementById('customerId').value = '';

                    // Populate package dropdown
                    const packageSelect = document.getElementById('customerPackage');
                    packageSelect.innerHTML = '<option value="">Pilih Paket...</option>';
                    const packages = await this.getAll('packages');
                    packages.forEach(p => {
                        const option = new Option(`${p.name} - ${this.formatCurrency(p.fee)}`, p.id);
                        option.dataset.fee = p.fee;
                        option.dataset.name = p.name;
                        packageSelect.add(option);
                    });
                    
                    if (id) {
                        const customer = await this.getById('customers', parseInt(id));
                        document.getElementById('customerModalTitle').textContent = 'Edit Pelanggan';
                        document.getElementById('customerId').value = customer.id;
                        document.getElementById('customerName').value = customer.name;
                        document.getElementById('customerWhatsapp').value = customer.whatsapp;
                        document.getElementById('customerFee').value = customer.fee;
                        // Match the package
                        const selectedPackage = Array.from(packageSelect.options).find(opt => opt.dataset.name === customer.package);
                        if (selectedPackage) packageSelect.value = selectedPackage.value;
                    } else {
                        document.getElementById('customerModalTitle').textContent = 'Tambah Pelanggan Baru';
                    }
                    document.getElementById('customerModal').classList.add('active');
                },

                updateCustomerFeeFromPackage(selectElement) {
                    const selectedOption = selectElement.options[selectElement.selectedIndex];
                    const feeInput = document.getElementById('customerFee');
                    if (selectedOption.value) {
                        feeInput.value = selectedOption.dataset.fee;
                    } else {
                        feeInput.value = '';
                    }
                },

                async saveCustomer() {
                    const id = document.getElementById('customerId').value;
                    const packageSelect = document.getElementById('customerPackage');
                    const selectedOption = packageSelect.options[packageSelect.selectedIndex];

                    if (!selectedOption.value) {
                        this.showToast('Silakan pilih paket internet', 'error');
                        return;
                    }

                    const customerData = {
                        name: document.getElementById('customerName').value.trim(),
                        whatsapp: document.getElementById('customerWhatsapp').value.trim(),
                        package: selectedOption.dataset.name,
                        fee: parseInt(selectedOption.dataset.fee)
                    };

                    if (!customerData.name || !customerData.whatsapp || !customerData.package || isNaN(customerData.fee)) {
                        this.showToast('Semua field wajib diisi', 'error');
                        return;
                    }
                    
                    try {
                        await this.transaction('customers', 'readwrite', tx => {
                            const store = tx.objectStore('customers');
                            if (id) {
                                customerData.id = parseInt(id);
                                store.put(customerData);
                            } else {
                                store.add(customerData);
                            }
                        });
                        this.showToast(`Pelanggan berhasil ${id ? 'diperbarui' : 'ditambahkan'}`, 'success');
                        document.getElementById('customerModal').classList.remove('active');
                        this.renderCustomers();
                        this.renderDashboard(); // Update customer count
                    } catch (error) {
                         this.showToast('Gagal menyimpan pelanggan', 'error');
                         console.error(error);
                    }
                },
                
                deleteCustomer(id) {
                    this.showConfirmation('Hapus Pelanggan', 'Anda yakin ingin menghapus pelanggan ini? Semua data tagihan terkait juga akan terhapus.', async () => {
                        try {
                            const billsToDelete = [];
                            const allBills = await this.getAll('bills');
                            allBills.forEach(bill => {
                                if (bill.customerId === parseInt(id)) {
                                    billsToDelete.push(bill.id);
                                }
                            });

                            await this.transaction(['customers', 'bills'], 'readwrite', tx => {
                                tx.objectStore('customers').delete(parseInt(id));
                                const billStore = tx.objectStore('bills');
                                billsToDelete.forEach(billId => billStore.delete(billId));
                            });
                             this.showToast('Pelanggan berhasil dihapus', 'success');
                             this.render();
                        } catch(error) {
                             this.showToast('Gagal menghapus pelanggan', 'error');
                             console.error(error);
                        }
                    });
                },

                // --- TAGIHAN ---
                async renderBills() {
                    const month = document.getElementById('billMonth').value;
                    const year = document.getElementById('billYear').value;
                    const period = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}`;
                    
                    const customers = await this.getAll('customers');
                    const bills = await this.getAll('bills');
                    const tbody = document.getElementById('billsTableBody');
                    tbody.innerHTML = '';

                    customers.forEach(c => {
                        const bill = bills.find(b => b.customerId === c.id && b.period === period);
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td><input type="checkbox" class="bill-checkbox" data-customer-id="${c.id}" data-bill-id="${bill ? bill.id : ''}" ${bill ? '' : 'disabled'}></td>
                            <td>${c.name}</td>
                            <td>${c.package}</td>
                            <td>${this.formatCurrency(c.fee)}</td>
                            <td>${bill ? `<span class="badge badge-${bill.status === 'Lunas' ? 'success' : 'danger'}">${bill.status}</span>` : '<span>Belum Dibuat</span>'}</td>
                            <td class="table-actions">
                                ${bill ? `<button class="table-btn view" data-id="${bill.id}" title="Lihat Struk"><i class="fas fa-receipt"></i></button>` : `<button class="btn btn-sm btn-primary" data-customer-id="${c.id}" onclick="App.createSingleBill(event)">Buat</button>`}
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });

                    tbody.querySelectorAll('.view').forEach(b => b.addEventListener('click', e => this.viewBillDetail(e.currentTarget.dataset.id)));
                },
                
                createSingleBill(event) {
                    const customerId = parseInt(event.target.dataset.customerId);
                    this.generateBillsForCurrentMonth(false, [customerId]);
                },

                async updateSelectedBillsStatus(status) {
                    const selected = document.querySelectorAll('#billsTableBody .bill-checkbox:checked');
                    if (selected.length === 0) {
                        this.showToast('Pilih setidaknya satu tagihan', 'error');
                        return;
                    }

                    const billIds = Array.from(selected).map(cb => parseInt(cb.dataset.billId));
                    
                    try {
                        await this.transaction('bills', 'readwrite', tx => {
                           const store = tx.objectStore('bills');
                           billIds.forEach(id => {
                               store.get(id).onsuccess = e => {
                                   const bill = e.target.result;
                                   if (bill) {
                                       bill.status = status;
                                       store.put(bill);
                                   }
                               };
                           });
                        });
                        this.showToast(`Tagihan berhasil ditandai ${status}`, 'success');
                        this.renderBills();
                    } catch (error) {
                        this.showToast('Gagal memperbarui status', 'error');
                        console.error(error);
                    }
                },
                
                generateBillsForCurrentMonth(isMassal = true, customerIds = []) {
                    const month = document.getElementById('billMonth').value;
                    const year = document.getElementById('billYear').value;
                    const period = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}`;
                    const monthName = this.getMonthName(month);
                    
                    this.showConfirmation(
                        'Buat Tagihan',
                        `Anda akan membuat tagihan untuk periode <strong>${monthName} ${year}</strong>. Tagihan yang sudah ada tidak akan ditimpa. Lanjutkan?`,
                        async () => {
                            const customersToBill = customerIds.length > 0
                                ? await Promise.all(customerIds.map(id => this.getById('customers', id)))
                                : await this.getAll('customers');
                            
                            let createdCount = 0;
                            let skippedCount = 0;

                            const tx = this.db.transaction('bills', 'readwrite');
                            const store = tx.objectStore('bills');
                            let i = 0;

                            const processCustomer = () => {
                                if (i < customersToBill.length) {
                                    const c = customersToBill[i];
                                    i++;
                                    const newBill = {
                                        customerId: c.id,
                                        period: period,
                                        amount: c.fee,
                                        status: 'Belum Lunas',
                                        createdAt: new Date().toISOString()
                                    };
                                    const request = store.add(newBill);
                                    request.onsuccess = () => {
                                        createdCount++;
                                        processCustomer();
                                    };
                                    request.onerror = (e) => {
                                        e.preventDefault(); // Mencegah transaksi gagal karena duplikat
                                        skippedCount++;
                                        processCustomer();
                                    };
                                }
                            };
                            
                            processCustomer();

                            tx.oncomplete = () => {
                                if (createdCount > 0) this.showToast(`${createdCount} tagihan baru berhasil dibuat`, 'success');
                                if (skippedCount > 0 && isMassal) this.showToast(`${skippedCount} tagihan dilewati karena sudah ada`, 'info');
                                
                                this.settings.lastBillGeneration = period;
                                this.saveSettings();
                                this.renderBills();
                            };

                            tx.onerror = (e) => {
                                this.showToast('Terjadi kesalahan saat membuat tagihan.', 'error');
                                console.error('Bill Generation Transaction Error:', e.target.error);
                            };
                        }
                    );
                },


                async checkAndPromptForBillGeneration() {
                    const now = new Date();
                    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    if (this.settings.lastBillGeneration !== currentPeriod) {
                        const customers = await this.getAll('customers');
                        if (customers.length > 0) {
                            this.showConfirmation(
                                'Buat Tagihan Bulan Ini?',
                                `Tampaknya Anda belum membuat tagihan untuk <strong>${this.getMonthName(now.getMonth())} ${now.getFullYear()}</strong>. Apakah Anda ingin membuatnya sekarang?`,
                                () => {
                                    document.getElementById('billMonth').value = now.getMonth();
                                    document.getElementById('billYear').value = now.getFullYear();
                                    this.generateBillsForCurrentMonth();
                                }
                            )
                        }
                    }
                },

                // --- HISTORI & DETAIL TAGIHAN ---
                async showBillHistory(customerId) {
                    customerId = parseInt(customerId);
                    const bills = await this.getAll('bills');
                    const customerBills = bills.filter(b => b.customerId === customerId).sort((a,b) => b.period.localeCompare(a.period));
                    
                    const tbody = document.getElementById('billHistoryTableBody');
                    tbody.innerHTML = '';
                    if (customerBills.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center;">Tidak ada histori tagihan.</td></tr>`;
                    } else {
                        customerBills.forEach(b => {
                            const [year, month] = b.period.split('-');
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${this.getMonthName(parseInt(month) - 1)} ${year}</td>
                                <td>${this.formatCurrency(b.amount)}</td>
                                <td><span class="badge badge-${b.status === 'Lunas' ? 'success' : 'danger'}">${b.status}</span></td>
                                <td>${this.formatDate(b.createdAt)}</td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }
                    document.getElementById('billHistoryModal').classList.add('active');
                },
                
                async viewBillDetail(billId) {
                    billId = parseInt(billId);
                    const bill = await this.getById('bills', billId);
                    if (!bill) {
                        this.showToast('Data tagihan tidak ditemukan', 'error');
                        return;
                    }
                    const customer = await this.getById('customers', bill.customerId);
                    const container = document.getElementById('receiptContainer');
                    const [year, month] = bill.period.split('-');

                    container.innerHTML = `
                        <div class="receipt" id="receiptContent">
                            <div class="receipt-header">
                                <div class="receipt-logo">
                                    ${this.settings.businessLogo ? `<img src="${this.settings.businessLogo}" alt="logo">` : this.settings.businessName.substring(0,2).toUpperCase()}
                                </div>
                                <div class="receipt-business-name">${this.settings.businessName}</div>
                            </div>
                            <div class="receipt-body">
                                <div class="receipt-row">
                                    <span class="receipt-label">Nama:</span>
                                    <span class="receipt-value">${customer.name}</span>
                                </div>
                                 <div class="receipt-row">
                                    <span class="receipt-label">Paket:</span>
                                    <span class="receipt-value">${customer.package}</span>
                                </div>
                                 <div class="receipt-row">
                                    <span class="receipt-label">Periode:</span>
                                    <span class="receipt-value">${this.getMonthName(parseInt(month) - 1)} ${year}</span>
                                </div>
                                <div class="receipt-row">
                                    <span class="receipt-label">Status:</span>
                                    <span class="receipt-value">${bill.status}</span>
                                </div>
                                <div class="receipt-row receipt-total">
                                    <span class="receipt-label">TOTAL:</span>
                                    <span class="receipt-value">${this.formatCurrency(bill.amount)}</span>
                                </div>
                            </div>
                            <div class="receipt-footer">
                                Terima kasih atas pembayaran Anda.
                            </div>
                        </div>
                    `;
                    document.getElementById('billDetailModal').classList.add('active');
                },

                async shareReceipt(button) {
                    const receiptElement = document.getElementById('receiptContent');
                    if (!receiptElement) return;

                    button.classList.add('loading');
                    
                    try {
                        const canvas = await html2canvas(receiptElement, { scale: 2 });
                        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                        const file = new File([blob], `struk-${this.settings.businessName}.png`, { type: 'image/png' });

                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                files: [file],
                                title: 'Struk Tagihan',
                                text: 'Berikut adalah struk tagihan Anda.'
                            });
                        } else {
                           this.showToast('Browser tidak mendukung fitur share. Gunakan fitur screenshot.', 'info');
                           // Fallback to download for desktop
                            const link = document.createElement('a');
                            link.download = `struk-${this.settings.businessName}.png`;
                            link.href = URL.createObjectURL(blob);
                            link.click();
                            URL.revokeObjectURL(link.href);
                        }
                    } catch (error) {
                        console.error('Share failed:', error);
                        this.showToast('Gagal membagikan struk', 'error');
                    } finally {
                        button.classList.remove('loading');
                    }
                },

                // --- LAPORAN ---
                async renderReports() {
                    const month = document.getElementById('reportMonth').value;
                    const year = document.getElementById('reportYear').value;
                    const period = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}`;

                    const allBills = await this.getAll('bills');
                    const periodBills = allBills.filter(b => b.period === period);
                    const customers = await this.getAll('customers');
                    const customerMap = new Map(customers.map(c => [c.id, c]));

                    const tbody = document.getElementById('reportTableBody');
                    tbody.innerHTML = '';
                    let totalIncome = 0;
                    let paidBills = 0;
                    
                    periodBills.forEach(bill => {
                        const customer = customerMap.get(bill.customerId);
                        if (!customer) return;

                        if (bill.status === 'Lunas') {
                            totalIncome += bill.amount;
                            paidBills++;
                        }

                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${customer.name}</td>
                            <td>${customer.package}</td>
                            <td>${this.formatCurrency(bill.amount)}</td>
                            <td><span class="badge badge-${bill.status === 'Lunas' ? 'success' : 'danger'}">${bill.status}</span></td>
                            <td>${this.formatDate(bill.createdAt)}</td>
                        `;
                        tbody.appendChild(tr);
                    });

                    const unpaidBills = periodBills.length - paidBills;
                    const paymentPercentage = periodBills.length > 0 ? Math.round((paidBills / periodBills.length) * 100) : 0;
                    
                    document.getElementById('reportTotalIncome').textContent = this.formatCurrency(totalIncome);
                    document.getElementById('reportPaidBills').textContent = paidBills;
                    document.getElementById('reportUnpaidBills').textContent = unpaidBills;
                    document.getElementById('reportPaymentPercentage').textContent = `${paymentPercentage}%`;
                },

                // --- PENGATURAN & DATA ---
                async renderSettings() {
                    document.getElementById('businessName').value = this.settings.businessName;
                    document.getElementById('whatsappMessage').value = this.settings.whatsappMessage;
                    document.getElementById('darkModeToggle').checked = this.settings.darkMode;
                    this.applySettingsUI();
                    await this.renderPackages();
                },

                applySettingsUI() {
                    document.documentElement.dataset.theme = this.settings.darkMode ? 'dark' : 'light';
                    document.getElementById('headerTitle').textContent = this.settings.businessName;
                    const logoDiv = document.getElementById('headerLogo');
                    if(this.settings.businessLogo) {
                        logoDiv.innerHTML = `<img src="${this.settings.businessLogo}" alt="logo">`;
                    } else {
                        logoDiv.innerHTML = this.settings.businessName.substring(0,2).toUpperCase();
                    }
                },
                
                async loadSettings() {
                    const settingsData = await this.getAll('settings');
                    settingsData.forEach(s => {
                        if (s.key in this.settings) {
                            this.settings[s.key] = s.value;
                        }
                    });
                    this.applySettingsUI();
                },
                
                async saveSettings() {
                     try {
                        await this.transaction('settings', 'readwrite', tx => {
                            const store = tx.objectStore('settings');
                            for (const key in this.settings) {
                                store.put({ key, value: this.settings[key] });
                            }
                        });
                        return true;
                    } catch (error) {
                        console.error(error);
                        return false;
                    }
                },

                async saveBusinessInfo(button) {
                    button.classList.add('loading');
                    this.settings.businessName = document.getElementById('businessName').value;
                    const logoFile = document.getElementById('businessLogo').files[0];
                    if (logoFile) {
                        this.settings.businessLogo = await this.fileToBase64(logoFile);
                    }
                    if (await this.saveSettings()) {
                        this.showToast('Info usaha disimpan', 'success');
                        this.applySettingsUI();
                    } else {
                        this.showToast('Gagal menyimpan info', 'error');
                    }
                    button.classList.remove('loading');
                },

                async saveAppSettings(button) {
                    button.classList.add('loading');
                    this.settings.whatsappMessage = document.getElementById('whatsappMessage').value;
                    if (await this.saveSettings()) {
                        this.showToast('Pengaturan aplikasi disimpan', 'success');
                    } else {
                        this.showToast('Gagal menyimpan pengaturan', 'error');
                    }
                    button.classList.remove('loading');
                },

                async toggleDarkMode(isDark) {
                    this.settings.darkMode = isDark;
                    if(await this.saveSettings()) {
                        this.applySettingsUI();
                        this.render(); // Re-render chart with new colors
                    }
                },

                clearAllData() {
                    this.showConfirmation('Hapus Semua Data', '<strong>PERINGATAN!</strong> Tindakan ini akan menghapus SEMUA data (pelanggan, tagihan, paket, pengaturan) secara permanen. Lakukan backup terlebih dahulu. Anda yakin?', async () => {
                        try {
                            await this.transaction(['customers', 'bills', 'settings', 'packages'], 'readwrite', tx => {
                                tx.objectStore('customers').clear();
                                tx.objectStore('bills').clear();
                                tx.objectStore('settings').clear();
                                tx.objectStore('packages').clear();
                            });
                            this.showToast('Semua data berhasil dihapus', 'success');
                            location.reload();
                        } catch(error) {
                            this.showToast('Gagal menghapus data', 'error');
                            console.error(error);
                        }
                    });
                },
                
                async backupData() {
                    try {
                        const data = {
                            customers: await this.getAll('customers'),
                            bills: await this.getAll('bills'),
                            settings: await this.getAll('settings'),
                            packages: await this.getAll('packages'),
                        };
                        const jsonString = JSON.stringify(data, null, 2);
                        const blob = new Blob([jsonString], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `backup-tagihan-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        this.showToast('Backup data berhasil diunduh', 'success');
                    } catch (error) {
                        this.showToast('Gagal melakukan backup', 'error');
                        console.error(error);
                    }
                },

                restoreData(event) {
                    const file = event.target.files[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = JSON.parse(e.target.result);
                            if (!data.customers || !data.bills || !data.settings || !data.packages) {
                                throw new Error('Format file backup tidak valid.');
                            }
                            this.showConfirmation('Restore Data', 'Data saat ini akan dihapus dan diganti dengan data dari file backup. Lanjutkan?', async () => {
                                try {
                                    await this.transaction(['customers', 'bills', 'settings', 'packages'], 'readwrite', tx => {
                                        const stores = {
                                            customers: tx.objectStore('customers'),
                                            bills: tx.objectStore('bills'),
                                            settings: tx.objectStore('settings'),
                                            packages: tx.objectStore('packages'),
                                        };
                                        Object.values(stores).forEach(store => store.clear());
                                        data.customers.forEach(item => stores.customers.add(item));
                                        data.bills.forEach(item => stores.bills.add(item));
                                        data.settings.forEach(item => stores.settings.add(item));
                                        data.packages.forEach(item => stores.packages.add(item));
                                    });
                                    this.showToast('Data berhasil di-restore', 'success');
                                    setTimeout(() => location.reload(), 1000);
                                } catch (error) {
                                    this.showToast('Gagal me-restore data', 'error');
                                    console.error(error);
                                }
                            });
                        } catch (error) {
                            this.showToast('File backup tidak valid atau rusak', 'error');
                            console.error(error);
                        }
                    };
                    reader.readAsText(file);
                    event.target.value = null; // Reset file input
                },

                // --- CRUD PAKET ---
                async renderPackages() {
                    const packages = await this.getAll('packages');
                    const tbody = document.getElementById('packagesTableBody');
                    tbody.innerHTML = '';
                    if (packages.length === 0) {
                         tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Belum ada paket. Silakan tambahkan.</td></tr>`;
                    }
                    packages.forEach(p => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${p.name}</td>
                            <td>${this.formatCurrency(p.fee)}</td>
                            <td class="table-actions">
                                <button class="table-btn edit" data-id="${p.id}" title="Edit"><i class="fas fa-edit"></i></button>
                                <button class="table-btn delete" data-id="${p.id}" title="Hapus"><i class="fas fa-trash"></i></button>
                            </td>
                        `;
                        tbody.appendChild(tr);
                    });
                    tbody.querySelectorAll('.edit').forEach(b => b.addEventListener('click', e => this.showPackageModal(e.currentTarget.dataset.id)));
                    tbody.querySelectorAll('.delete').forEach(b => b.addEventListener('click', e => this.deletePackage(e.currentTarget.dataset.id)));
                },

                async showPackageModal(id = null) {
                    const form = document.getElementById('packageForm');
                    form.reset();
                    document.getElementById('packageId').value = '';
                    
                    if (id) {
                        const pkg = await this.getById('packages', parseInt(id));
                        document.getElementById('packageModalTitle').textContent = 'Edit Paket';
                        document.getElementById('packageId').value = pkg.id;
                        document.getElementById('packageName').value = pkg.name;
                        document.getElementById('packageFee').value = pkg.fee;
                    } else {
                        document.getElementById('packageModalTitle').textContent = 'Tambah Paket Baru';
                    }
                    document.getElementById('packageModal').classList.add('active');
                },

                async savePackage() {
                    const id = document.getElementById('packageId').value;
                    const packageData = {
                        name: document.getElementById('packageName').value.trim(),
                        fee: parseInt(document.getElementById('packageFee').value)
                    };
                    if (!packageData.name || isNaN(packageData.fee)) {
                        this.showToast('Nama paket dan biaya wajib diisi', 'error');
                        return;
                    }
                    try {
                        await this.transaction('packages', 'readwrite', tx => {
                            const store = tx.objectStore('packages');
                            if (id) {
                                packageData.id = parseInt(id);
                                store.put(packageData);
                            } else {
                                store.add(packageData);
                            }
                        });
                        this.showToast(`Paket berhasil ${id ? 'diperbarui' : 'disimpan'}`, 'success');
                        document.getElementById('packageModal').classList.remove('active');
                        this.renderPackages();
                    } catch (error) {
                        this.showToast('Gagal menyimpan paket', 'error');
                        console.error(error);
                    }
                },

                deletePackage(id) {
                    this.showConfirmation('Hapus Paket', 'Anda yakin ingin menghapus paket ini? Pelanggan yang menggunakan paket ini tidak akan terhapus.', async () => {
                         try {
                            await this.transaction('packages', 'readwrite', tx => {
                                tx.objectStore('packages').delete(parseInt(id));
                            });
                             this.showToast('Paket berhasil dihapus', 'success');
                             this.renderPackages();
                        } catch(error) {
                             this.showToast('Gagal menghapus paket', 'error');
                             console.error(error);
                        }
                    });
                },

                // --- IMPOR & EKSPOR XLSX ---
                showImportModal() {
                    document.getElementById('xlsxFileName').textContent = '';
                    document.getElementById('importCustomerFileInput').value = null;
                    document.getElementById('importCustomerModal').classList.add('active');
                },

                async downloadImportTemplate() {
                    const data = [['Nama', 'NomorWhatsApp', 'Paket']];
                    const packages = await this.getAll('packages');
                    if (packages.length > 0) {
                        data.push(['Budi Santoso', '6281234567890', packages[0].name]);
                    } else {
                        data.push(['Budi Santoso', '6281234567890', 'NAMA PAKET HARUS SAMA']);
                    }

                    const ws = XLSX.utils.aoa_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Pelanggan');
                    XLSX.writeFile(wb, 'template_impor_pelanggan.xlsx');
                },

                async processImport() {
                    const fileInput = document.getElementById('importCustomerFileInput');
                    const file = fileInput.files[0];
                    if (!file) {
                        this.showToast('Pilih file Excel terlebih dahulu', 'error');
                        return;
                    }

                    const packages = await this.getAll('packages');
                    const packageMap = new Map(packages.map(p => [p.name.toLowerCase(), p]));

                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const json = XLSX.utils.sheet_to_json(worksheet, { header: ['Nama', 'NomorWhatsApp', 'Paket'] });

                        // skip header row
                        json.shift();

                        const newCustomers = [];
                        let errorCount = 0;
                        json.forEach(row => {
                            const packageName = row.Paket ? row.Paket.trim().toLowerCase() : '';
                            const matchedPackage = packageMap.get(packageName);

                            if (row.Nama && row.NomorWhatsApp && matchedPackage) {
                                newCustomers.push({
                                    name: row.Nama.trim(),
                                    whatsapp: String(row.NomorWhatsApp).trim(),
                                    package: matchedPackage.name,
                                    fee: matchedPackage.fee
                                });
                            } else {
                                errorCount++;
                            }
                        });

                        if (newCustomers.length > 0) {
                            try {
                                await this.transaction('customers', 'readwrite', tx => {
                                    const store = tx.objectStore('customers');
                                    newCustomers.forEach(c => store.add(c));
                                });
                                this.showToast(`${newCustomers.length} pelanggan berhasil diimpor`, 'success');
                                if (errorCount > 0) {
                                    this.showToast(`${errorCount} baris gagal diimpor karena nama paket tidak cocok`, 'warning');
                                }
                                document.getElementById('importCustomerModal').classList.remove('active');
                                this.render();
                            } catch(error) {
                                this.showToast('Gagal mengimpor data', 'error');
                                console.error(error);
                            }
                        } else {
                            this.showToast('Tidak ada data valid untuk diimpor. Periksa kembali nama paket di file Anda.', 'error');
                        }
                    };
                    reader.readAsArrayBuffer(file);
                },

                exportTableToCSV(tableId, filename) {
                    const table = document.getElementById(tableId);
                    let csv = [];
                    // Header
                    let header = [];
                    table.querySelectorAll('thead th').forEach(th => header.push(`"${th.textContent}"`));
                    csv.push(header.join(','));
                    // Rows
                    table.querySelectorAll('tbody tr').forEach(row => {
                        let rowData = [];
                        row.querySelectorAll('td').forEach(td => rowData.push(`"${td.textContent}"`));
                        csv.push(rowData.join(','));
                    });
                    
                    const csvString = csv.join('\n');
                    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", filename);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    this.showToast('Laporan berhasil diekspor', 'success');
                },
                
                // --- BROADCAST ---
                async broadcastBills() {
                    const month = document.getElementById('billMonth').value;
                    const year = document.getElementById('billYear').value;
                    const period = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}`;
                    
                    const bills = await this.getAll('bills');
                    const customers = await this.getAll('customers');
                    const customerMap = new Map(customers.map(c => [c.id, c]));
                    const periodBills = bills.filter(b => b.period === period);

                    if (periodBills.length === 0) {
                        this.showToast('Tidak ada tagihan untuk periode ini', 'error');
                        return;
                    }

                    periodBills.forEach((bill, index) => {
                        const customer = customerMap.get(bill.customerId);
                        if (!customer) return;

                        let msg = this.settings.whatsappMessage;
                        msg = msg.replace(/\[Nama\]/g, customer.name)
                                 .replace(/\[Bulan\]/g, this.getMonthName(month))
                                 .replace(/\[Tahun\]/g, year)
                                 .replace(/\[Jumlah\]/g, this.formatCurrency(bill.amount))
                                 .replace(/\[Status\]/g, bill.status);
                        
                        const url = `https://wa.me/${customer.whatsapp}?text=${encodeURIComponent(msg)}`;
                        
                        // Membuka tab baru dengan jeda untuk menghindari pemblokiran pop-up
                        setTimeout(() => {
                           window.open(url, '_blank');
                        }, index * 300); 
                    });
                    this.showToast(`Membuka ${periodBills.length} tab WhatsApp...`, 'info');
                },

                // --- Helper utilitas ---
                async fileToBase64(file) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = error => reject(error);
                    });
                },
            };

            App.init();
            
            // Expose to window for inline onclicks
            window.App = App;
        });
    \n