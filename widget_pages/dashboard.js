        const REGION = '{{REGION}}';
        const API_BASE = window.location.origin;

        // Get userId from URL params (passed by frontend when opening widget)
        function getUserId() {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('userId') || urlParams.get('user_id') || null;
        }

        // Fetch data from backend and render dashboard
        async function loadDashboard() {
            try {
                const userId = getUserId();
                // Prevent additional loads if we've reached UI limit
                const preContainer = document.getElementById('s3ItemsContainer');
                const preMax = preContainer ? parseInt(preContainer.dataset.maxPages || '5') : 5;
                const preLoaded = preContainer ? parseInt(preContainer.dataset.pagesLoaded || '1') : 1;
                if (preLoaded >= preMax) {
                    showToast('⚠️ Maximum pages loaded for this bucket', 'warning');
                    if (loadMoreBtn) {
                        loadMoreBtn.innerHTML = 'Max pages reached';
                        loadMoreBtn.disabled = true;
                    }
                    return;
                }
                const url = `${API_BASE}/server/aws_handler/widget/dashboard/data?region=${encodeURIComponent(REGION)}${userId ? '&userId=' + encodeURIComponent(userId) : ''}`;
                const response = await fetch(url);
                const data = await response.json();

                if (!data.success) {
                    // Check if it's a credentials/setup error - show nice UI
                    if (data.errorCode === 'NO_CREDENTIALS' || data.errorCode === 'NO_USER_ID') {
                        showCredentialsError(data);
                        return;
                    }
                    // Invalid/expired credentials - show nice error UI
                    if (data.errorCode === 'INVALID_CREDENTIALS' || data.errorCode === 'EXPIRED_CREDENTIALS') {
                        showInvalidCredentialsError(data);
                        return;
                    }
                    // Access denied - show permissions error UI
                    if (data.errorCode === 'ACCESS_DENIED') {
                        showAccessDeniedError(data);
                        return;
                    }
                    // Other errors - show generic error screen
                    throw new Error(data.error || 'Failed to fetch data');
                }

                renderDashboard(data);

                // Hide loader, show content
                document.getElementById('loadingScreen').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';

                // Friendly toast to confirm dashboard is ready
                try {
                    showToast('✅ AWS Cloud Commander dashboard loaded', 'success', 3500);
                } catch (e) {
                    console.error('Toast failed:', e);
                }
                // Kick off async update for S3 rows to show actual counts/sizes
                setTimeout(() => {
                    try {
                        lazyUpdateS3Stats();
                    } catch (e) {
                        console.error('Failed to lazy update S3 stats:', e);
                    }
                }, 250);

            } catch (error) {
                console.error('Dashboard error:', error);
                document.getElementById('loadingScreen').style.display = 'none';
                document.getElementById('errorMessage').textContent = error.message;
                document.getElementById('errorScreen').style.display = 'flex';
            }
        }

        async function lazyUpdateS3Stats() {
            const userId = getUserId();
            const rows = document.querySelectorAll('.s3-row[data-bucket-name]');
            if (!rows || rows.length === 0) return;

            const concurrency = 3;
            const queue = Array.from(rows);

            async function updateRow(row) {
                const bucket = row.getAttribute('data-bucket-name');
                const reg = row.getAttribute('data-bucket-region') || REGION;
                const objectsSpan = row.querySelector('.s3-objects-count');
                const sizeSpan = row.querySelector('.s3-size-text');

                try {
                    if (objectsSpan) objectsSpan.innerHTML = '...';
                    if (sizeSpan) sizeSpan.innerHTML = 'Calculating...';

                    const response = await fetch(`${API_BASE}/server/aws_handler/widget/s3/info?bucket=${encodeURIComponent(bucket)}&userId=${userId}&region=${reg}`);
                    const data = await response.json();
                    if (data && data.success && data.data) {
                        if (objectsSpan) objectsSpan.textContent = (data.data.totalObjects || 0).toLocaleString();
                        if (sizeSpan) sizeSpan.textContent = data.data.totalSizeFormatted || '—';
                    } else {
                        if (objectsSpan) objectsSpan.textContent = '—';
                        if (sizeSpan) sizeSpan.textContent = '—';
                    }
                } catch (err) {
                    console.error('Update S3 row failed for', bucket, err);
                    if (objectsSpan) objectsSpan.textContent = '—';
                    if (sizeSpan) sizeSpan.textContent = '—';
                }
            }

            while (queue.length) {
                const batch = queue.splice(0, concurrency);
                await Promise.all(batch.map(r => updateRow(r)));
            }
        }

        // Show beautiful credentials setup screen
        function showCredentialsError(data) {
            document.getElementById('loadingScreen').style.display = 'none';
            
            // Customize title based on error type
            const errorTitle = data.errorCode === 'NO_USER_ID' 
                ? 'Setup Required' 
                : 'AWS Credentials Not Set Up';
            
            const html = `
                <div style="display: flex; align-items: center; justify-content: center; min-height: 400px; padding: 40px 20px;">
                    <div style="text-align: center; max-width: 420px;">
                        <!-- AWS Logo -->
                        <div style="width: 96px; height: 96px; margin: 0 auto 32px; background: linear-gradient(135deg, #FF9900 0%, #FFB84D 100%); border-radius: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 32px rgba(255, 153, 0, 0.3);">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5">
                                <path d="M6.5 17.5c-1.5 0-2.5-1-2.5-2.5 0-1.3.8-2.3 2-2.5 0-2.5 2-4.5 4.5-4.5 2 0 3.7 1.3 4.3 3.2.5-.1 1-.2 1.5-.2 2.2 0 4 1.8 4 4s-1.8 4-4 4h-10z"/>
                            </svg>
                        </div>

                        <!-- Title -->
                        <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">
                            ${errorTitle}
                        </h2>

                        <!-- Description -->
                        <p style="font-size: 14px; color: var(--text-muted); line-height: 1.6; margin-bottom: 32px;">
                            ${data.message || 'To access your AWS resources, please complete your setup first.'}
                        </p>

                        <!-- Setup Card -->
                        <div style="background: linear-gradient(135deg, rgba(255,153,0,0.1) 0%, rgba(255,153,0,0.05) 100%); border: 1.5px solid var(--aws-orange); border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                                <div style="width: 48px; height: 48px; background: var(--aws-orange); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                    </svg>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                                        Quick Setup
                                    </h3>
                                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
                                        Configure your credentials in Cliq
                                    </p>
                                </div>
                            </div>

                            <!-- Command Box -->
                            <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; text-align: left;">
                                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                                    Run this command in Cliq:
                                </div>
                                <code style="font-family: 'SF Mono', Monaco, monospace; font-size: 15px; color: var(--aws-orange); font-weight: 600; display: block;">
                                    ${data.action?.command || '/aws setup'}
                                </code>
                            </div>
                        </div>

                        <!-- Help Link -->
                        <div style="font-size: 12px; color: var(--text-muted);">
                            Need help? Check the 
                            <a href="#" style="color: var(--aws-orange); text-decoration: none; font-weight: 500;">
                                setup guide
                            </a>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('mainContent').innerHTML = html;
            document.getElementById('mainContent').style.display = 'block';
        }

        // Show invalid/expired credentials error
        function showInvalidCredentialsError(data) {
            document.getElementById('loadingScreen').style.display = 'none';
            
            const isExpired = data.errorCode === 'EXPIRED_CREDENTIALS';
            const iconColor = isExpired ? '#FFB300' : '#FF5252';
            
            const html = `
                <div style="display: flex; align-items: center; justify-content: center; min-height: 400px; padding: 40px 20px;">
                    <div style="text-align: center; max-width: 460px;">
                        <!-- Error Icon -->
                        <div style="width: 96px; height: 96px; margin: 0 auto 32px; background: linear-gradient(135deg, ${iconColor}22 0%, ${iconColor}11 100%); border-radius: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid ${iconColor};">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>

                        <!-- Title -->
                        <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">
                            ${isExpired ? '🕐 Credentials Expired' : '❌ Invalid AWS Credentials'}
                        </h2>

                        <!-- Description -->
                        <p style="font-size: 15px; color: var(--text-primary); line-height: 1.6; margin-bottom: 8px; font-weight: 500;">
                            ${data.message || 'Your AWS credentials are invalid or incorrect.'}
                        </p>
                        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 32px;">
                            ${data.details || 'Please update your credentials with valid AWS keys.'}
                        </p>

                        <!-- Action Card -->
                        <div style="background: linear-gradient(135deg, ${iconColor}15 0%, ${iconColor}08 100%); border: 1.5px solid ${iconColor}; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                                <div style="width: 48px; height: 48px; background: ${iconColor}; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                                        Update Your Credentials
                                    </h3>
                                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
                                        Fix your AWS credentials in Cliq
                                    </p>
                                </div>
                            </div>

                            <!-- Command Box -->
                            <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; text-align: left;">
                                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                                    Run this command in Cliq:
                                </div>
                                <code style="font-family: 'SF Mono', Monaco, monospace; font-size: 15px; color: ${iconColor}; font-weight: 600; display: block;">
                                    ${data.action?.command || '/aws'}
                                </code>
                            </div>
                        </div>

                        <!-- Help Text -->
                        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
                            ${isExpired 
                                ? 'Generate new access keys from AWS IAM Console and update them here.' 
                                : 'Make sure you\'re using the correct Access Key ID and Secret Access Key from AWS IAM.'}
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('mainContent').innerHTML = html;
            document.getElementById('mainContent').style.display = 'block';
        }

        // Show access denied error
        function showAccessDeniedError(data) {
            document.getElementById('loadingScreen').style.display = 'none';
            
            const html = `
                <div style="display: flex; align-items: center; justify-content: center; min-height: 400px; padding: 40px 20px;">
                    <div style="text-align: center; max-width: 460px;">
                        <!-- Lock Icon -->
                        <div style="width: 96px; height: 96px; margin: 0 auto 32px; background: linear-gradient(135deg, #FFB30022 0%, #FFB30011 100%); border-radius: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid #FFB300;">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#FFB300" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                        </div>

                        <!-- Title -->
                        <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">
                            🔒 Access Denied
                        </h2>

                        <!-- Description -->
                        <p style="font-size: 15px; color: var(--text-primary); line-height: 1.6; margin-bottom: 8px; font-weight: 500;">
                            ${data.message || 'Your AWS credentials don\'t have sufficient permissions.'}
                        </p>
                        <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 32px;">
                            ${data.details || 'Add the required IAM permissions to your AWS user.'}
                        </p>

                        <!-- Action Card -->
                        <div style="background: linear-gradient(135deg, #FFB30015 0%, #FFB30008 100%); border: 1.5px solid #FFB300; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                                <div style="width: 48px; height: 48px; background: #FFB300; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
                                        <path d="M9 11l3 3L22 4"/>
                                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                    </svg>
                                </div>
                                <div style="flex: 1; text-align: left;">
                                    <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                                        Check Required Permissions
                                    </h3>
                                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
                                        See what IAM permissions you need
                                    </p>
                                </div>
                            </div>

                            <!-- Command Box -->
                            <div style="background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; text-align: left;">
                                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                                    Run this command in Cliq:
                                </div>
                                <code style="font-family: 'SF Mono', Monaco, monospace; font-size: 15px; color: #FFB300; font-weight: 600; display: block;">
                                    ${data.action?.command || '/aws permissions'}
                                </code>
                            </div>
                        </div>

                        <!-- Help Text -->
                        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
                            Add these permissions to your IAM user or role in AWS Console, then try again.
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('mainContent').innerHTML = html;
            document.getElementById('mainContent').style.display = 'block';
        }

        function renderDashboard(data) {
            const html = `
                <!-- Header -->
                <div class="header">
                    <span class="region-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                        ${data.region}
                    </span>
                    <span class="health-badge ${data.health.status}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        ${data.health.text}
                    </span>
                </div>

                <!-- Stats Grid -->
                <div class="stats-grid">
                    <div class="stat-card ec2">
                        <div class="stat-header">
                            <div class="stat-icon ec2">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                                    <path d="M8 21h8M12 17v4"/>
                                </svg>
                            </div>
                            <span class="stat-title">EC2 Instances</span>
                        </div>
                        <div class="stat-value orange">${data.ec2.total}</div>
                        <div class="stat-meta">
                            <span class="stat-meta-item"><span class="status-dot running"></span> ${data.ec2.running} running</span>
                            <span class="stat-meta-item"><span class="status-dot stopped"></span> ${data.ec2.stopped} stopped</span>
                        </div>
                    </div>

                    <div class="stat-card s3">
                        <div class="stat-header">
                            <div class="stat-icon s3">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                                </svg>
                            </div>
                            <span class="stat-title">S3 Buckets</span>
                        </div>
                        <div class="stat-value green">${data.s3.count}</div>
                        <div class="stat-meta">
                            <span class="stat-meta-item">Storage containers</span>
                        </div>
                    </div>

                    <div class="stat-card lambda">
                        <div class="stat-header">
                            <div class="stat-icon lambda">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                </svg>
                            </div>
                            <span class="stat-title">Lambda Functions</span>
                        </div>
                        <div class="stat-value purple">${data.lambda.count}</div>
                        <div class="stat-meta">
                            <span class="stat-meta-item">Serverless compute</span>
                        </div>
                    </div>

                    <div class="stat-card alarms ${data.alarms.hasActive ? 'alarm-active' : ''}">
                        <div class="stat-header">
                            <div class="stat-icon alarms">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                </svg>
                            </div>
                            <span class="stat-title">CloudWatch Alarms</span>
                        </div>
                        <div class="stat-value red">${data.alarms.active}</div>
                        <div class="stat-meta">
                            <span class="stat-meta-item"><span class="status-dot ok"></span> ${data.alarms.ok} OK</span>
                            <span class="stat-meta-item"><span class="status-dot alarm"></span> ${data.alarms.total} total</span>
                        </div>
                    </div>
                </div>

                <!-- Cost Section -->
                <div class="cost-section">
                    <div class="section-header">
                        <div class="section-title">
                            <div class="section-title-icon cost">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <line x1="12" y1="1" x2="12" y2="23"/>
                                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                </svg>
                            </div>
                            Cost Overview
                        </div>
                        <span class="section-badge">This Month</span>
                    </div>
                    ${data.cost.error ? `
                        <div class="cost-error">
                            <div class="cost-error-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div class="cost-error-content">
                                <h4>Cost Explorer Access Required</h4>
                                <p>Add <code>ce:GetCostAndUsage</code> permission to your IAM policy to view cost data.</p>
                            </div>
                        </div>
                    ` : `
                        <div class="cost-grid">
                            <div class="cost-item main">
                                <div class="cost-label">Month to Date</div>
                                <div class="cost-value main">${data.cost.month}</div>
                            </div>
                            <div class="cost-item">
                                <div class="cost-label">Today</div>
                                <div class="cost-value">${data.cost.today}</div>
                            </div>
                            <div class="cost-item">
                                <div class="cost-label">Daily Average</div>
                                <div class="cost-value">${data.cost.dailyAvg}</div>
                            </div>
                        </div>
                        ${data.cost.topServicesHtml ? `<div class="cost-services"><div class="cost-services-title">Top Services</div>${data.cost.topServicesHtml}</div>` : ''}
                    `}
                </div>

                <!-- Two Column: EC2 and S3 -->
                <div class="two-col">
                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon ec2">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                                        <path d="M8 21h8M12 17v4"/>
                                    </svg>
                                </div>
                                EC2 Instances
                            </div>
                            <span class="section-badge">${data.ec2.total} total</span>
                        </div>
                        <div class="instance-list">${data.ec2.html}</div>
                    </div>

                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon s3">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    </svg>
                                </div>
                                S3 Buckets
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="section-badge">${data.s3.count} buckets</span>
                                <button class="btn-custom btn-primary btn-sm" onclick="window.showCreateBucketModal()" style="padding: 6px 12px; font-size: 12px;">
                                    <i class="bi bi-plus-circle" style="font-size: 14px;"></i> Create Bucket
                                </button>
                        </div>
                        </div>
                        <div class="s3-list" id="s3-list-container">${data.s3.html}</div>
                        ${data.s3.count > 5 ? `
                            <div class="pagination-controls" style="display: flex; justify-content: center; align-items: center; gap: 12px; padding: 12px; border-top: 1px solid var(--border-primary);">
                                <button class="pagination-btn" onclick="window.changeS3Page(-1)" id="s3-prev-btn" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-size: 12px;">
                                    ← Previous
                                </button>
                                <span class="pagination-info" id="s3-page-info" style="font-size: 12px; color: var(--text-secondary);">Page 1 of ${Math.ceil(data.s3.count / 5)}</span>
                                <button class="pagination-btn" onclick="window.changeS3Page(1)" id="s3-next-btn" style="padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-size: 12px;">
                                    Next →
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Lambda Functions -->
                <div class="section-card" style="margin-bottom: 20px;">
                    <div class="section-header">
                        <div class="section-title">
                            <div class="section-title-icon lambda">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                </svg>
                            </div>
                            Lambda Functions
                        </div>
                        <span class="section-badge">${data.lambda.count} functions</span>
                    </div>
                    <div class="lambda-list">${data.lambda.html}</div>
                </div>

                <!-- CloudWatch Alarms -->
                <div class="section-card" style="margin-bottom: 20px;">
                    <div class="section-header">
                        <div class="section-title">
                            <div class="section-title-icon alarms">
                                <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                                </svg>
                            </div>
                            CloudWatch Alarms
                        </div>
                        <span class="section-badge">${data.alarms.active} active / ${data.alarms.total} total</span>
                    </div>
                    <div class="alarm-list">${data.alarms.html}</div>
                </div>

                <!-- Two Column: RDS and Logs -->
                <div class="two-col">
                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon" style="background: rgba(59,130,246,0.15);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" style="stroke: var(--aws-blue);">
                                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                                    </svg>
                                </div>
                                RDS Databases
                            </div>
                            <span class="section-badge">${data.rds.count} instances</span>
                        </div>
                        <div class="rds-list">${data.rds.html}</div>
                    </div>

                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon" style="background: rgba(59,130,246,0.15);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" style="stroke: var(--aws-blue);">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14 2 14 8 20 8"/>
                                        <line x1="16" y1="13" x2="8" y2="13"/>
                                        <line x1="16" y1="17" x2="8" y2="17"/>
                                    </svg>
                                </div>
                                CloudWatch Logs
                            </div>
                            <span class="section-badge">${data.logs.count} log groups</span>
                        </div>
                        <div class="log-list">${data.logs.html}</div>
                    </div>
                </div>

                <!-- Charts Section -->
                <div class="two-col" style="margin-top: 20px;">
                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon cost">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M12 6v6l4 2"/>
                                    </svg>
                                </div>
                                Cost Breakdown
                            </div>
                            <span class="section-badge">By Service</span>
                        </div>
                        <div>${data.cost.donutHtml || (data.cost.error ? `
                            <div class="cost-breakdown-error">
                                <div class="cost-breakdown-error-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                                    </svg>
                                </div>
                                <div class="cost-breakdown-error-title">Cost Data Unavailable</div>
                                <div class="cost-breakdown-error-text">Enable Cost Explorer API access to view spending breakdown by service</div>
                                <div class="cost-breakdown-error-permission">
                                    <code>ce:GetCostAndUsage</code>
                                </div>
                            </div>
                        ` : '<div class="empty-state small"><div class="empty-title">No cost data</div></div>')}</div>
                    </div>

                    <div class="section-card">
                        <div class="section-header">
                            <div class="section-title">
                                <div class="section-title-icon lambda">
                                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2">
                                        <path d="M3 3v18h18"/>
                                        <path d="M18 17V9"/>
                                        <path d="M13 17V5"/>
                                        <path d="M8 17v-3"/>
                                    </svg>
                                </div>
                                Lambda Activity
                            </div>
                            <span class="section-badge">Last 24h</span>
                        </div>
                        ${data.lambda.chartHtml}
                    </div>
                </div>
            `;

            document.getElementById('mainContent').innerHTML = html;
            
            // Initialize S3 pagination after DOM is ready
            setTimeout(() => {
                initializeS3Pagination();
            }, 100);
        }

        // ====================================================================
        // INTERACTIVE FEATURES - Bootstrap Modal & Toast
        // ====================================================================

        // Custom Modal Management
        let activeModal = null;
        let modalStack = []; // Track modal history

        function openModal(content, options = {}) {
            // Save current modal content to stack if replacing
            if (activeModal && options.pushToStack !== false) {
                const currentContent = document.getElementById('customModalBody').innerHTML;
                const currentTitle = document.getElementById('customModalTitle').textContent;
                modalStack.push({ content: currentContent, title: currentTitle });
            }

            // Get or create modal element
            let modalOverlay = document.getElementById('customModalOverlay');
            if (!modalOverlay) {
                modalOverlay = document.createElement('div');
                modalOverlay.id = 'customModalOverlay';
                modalOverlay.className = 'custom-modal-overlay';
                modalOverlay.innerHTML = `
                    <div class="custom-modal ${options.size === 'large' ? 'custom-modal-lg' : options.size === 'xlarge' ? 'custom-modal-xl' : options.size === 'small' ? 'custom-modal-sm' : ''}">
                        <div class="custom-modal-header">
                            <h5 class="custom-modal-title" id="customModalTitle"></h5>
                            <button type="button" class="custom-modal-close" onclick="closeModal()">
                                <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                        <div class="custom-modal-body" id="customModalBody"></div>
                </div>
            `;
                document.body.appendChild(modalOverlay);

            // Close on overlay click
                modalOverlay.addEventListener('click', (e) => {
                    if (e.target === modalOverlay) {
                        closeModal();
                    }
                });
            }

            // Update size class
            const modal = modalOverlay.querySelector('.custom-modal');
            modal.className = 'custom-modal';
            if (options.size === 'small') modal.classList.add('custom-modal-sm');
            if (options.size === 'large') modal.classList.add('custom-modal-lg');
            if (options.size === 'xlarge') modal.classList.add('custom-modal-xl');

            // Set content
            document.getElementById('customModalTitle').textContent = options.title || '';
            document.getElementById('customModalBody').innerHTML = content;

            // Show modal
            modalOverlay.classList.add('active');
            activeModal = modalOverlay;
        }

        function closeModal() {
            const modalOverlay = document.getElementById('customModalOverlay');
            if (!modalOverlay) return;
            
            // Clear modal stack and close completely
            modalStack = [];
            modalOverlay.classList.remove('active');
            activeModal = null;
        }

        function closeAllModals() {
            modalStack = [];
            const modalOverlay = document.getElementById('customModalOverlay');
            if (modalOverlay) {
                modalOverlay.classList.remove('active');
            }
            activeModal = null;
        }

        // Make functions globally accessible
        window.closeModal = closeModal;
        window.closeAllModals = closeAllModals;

        // Toast Notifications (using Toastify for reliability)
        function showToast(message, type = 'success', delay = 3000) {
            const backgroundMap = {
                success: 'linear-gradient(to right, #00b09b, #96c93d)',
                error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
                warning: 'linear-gradient(to right, #f9d976, #f39f86)',
                info: 'linear-gradient(to right, #2193b0, #6dd5ed)'
            };

            const bg = backgroundMap[type] || backgroundMap.info;

            if (window.Toastify) {
                Toastify({
                    text: message,
                    duration: delay,
                    gravity: 'bottom',
                    position: 'right',
                    close: true,
                    stopOnFocus: true,
                    style: { background: bg, borderRadius: '8px', fontSize: '13px' }
                }).showToast();
            } else {
                // Fallback: simple alert so user still sees something
                alert(message);
            }
        }

        // Expose toast globally for onclick handlers if needed
        window.showToast = showToast;

        // ====================================================================
        // EC2 INTERACTIVE ACTIONS
        // ====================================================================

        async function performEC2Action(instanceId, action, instanceName) {
            const actionNames = {
                start: 'Starting',
                stop: 'Stopping',
                reboot: 'Rebooting'
            };

            const loadingNames = {
                start: 'Starting instance...',
                stop: 'Stopping instance...',
                reboot: 'Rebooting instance...'
            };

            // Show loading toast
            showToast(loadingNames[action], 'info');

            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=${action}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceId: instanceId,
                        userId: userId,
                        region: REGION
                    })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('✓ ' + actionNames[action] + ' ' + (instanceName || instanceId) + ' successfully', 'success');
                    // Reload dashboard after 2 seconds to reflect changes
                    setTimeout(() => loadDashboard(), 2000);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to ' + action + ' instance'), 'error');
                }
            } catch (error) {
                console.error('EC2 ' + action + ' error:', error);
                showToast('❌ Network error: Failed to ' + action + ' instance', 'error');
            }
        }

        function showEC2ActionsMenu(instanceId, instanceName, state) {
            const actions = [];
            
            // Lifecycle actions
            if (state === 'stopped') {
                actions.push({ label: 'Start Instance', action: 'start', icon: 'bi-play-fill', btnClass: 'btn-success' });
            }
            if (state === 'running') {
                actions.push({ label: 'Stop Instance', action: 'stop', icon: 'bi-stop-fill', btnClass: 'btn-warning' });
                actions.push({ label: 'Reboot Instance', action: 'reboot', icon: 'bi-arrow-clockwise', btnClass: 'btn-info' });
            }
            
            // Tier 1 Critical Actions
            actions.push({ label: 'Create Snapshot', action: 'create-snapshot', icon: 'bi-camera', btnClass: 'btn-primary', tier: 1 });
            actions.push({ label: 'Manage Security Groups', action: 'security-groups', icon: 'bi-shield-check', btnClass: 'btn-secondary', tier: 1 });
            actions.push({ label: 'Manage Elastic IP', action: 'elastic-ip', icon: 'bi-globe', btnClass: 'btn-secondary', tier: 1 });
            actions.push({ label: 'View Metrics', action: 'metrics', icon: 'bi-graph-up', btnClass: 'btn-primary' });
            
            // Dangerous action at bottom
            actions.push({ label: 'Terminate Instance', action: 'terminate', icon: 'bi-trash', btnClass: 'btn-danger', tier: 1, divider: true });

            const escapedInstanceName = (instanceName || '').replace(/'/g, "\\'");

            let html = '<div class="action-menu">';
            actions.forEach((item, idx) => {
                // Add divider if specified
                if (item.divider) {
                    html += '<div style="border-top: 1px solid var(--border-primary); margin: 8px 0;"></div>';
                }
                
                if (item.action === 'metrics') {
                    html += '<button class="btn-custom ' + item.btnClass + '" id="actionBtn' + idx + '" onclick="showEC2Metrics(\'' + instanceId + '\', \'' + escapedInstanceName + '\')">' +
                        '<i class="bi ' + item.icon + '"></i>' + item.label +
                    '</button>';
                } else if (item.tier === 1) {
                    // Tier 1 actions go to specialized handlers
                    html += '<button class="btn-custom ' + item.btnClass + '" id="actionBtn' + idx + '" onclick="handleTier1Action(\'' + instanceId + '\', \'' + escapedInstanceName + '\', \'' + item.action + '\', \'' + state + '\')">' +
                        '<i class="bi ' + item.icon + '"></i>' + item.label +
                    '</button>';
                } else {
                    html += '<button class="btn-custom ' + item.btnClass + '" id="actionBtn' + idx + '" onclick="handleEC2ActionClick(this, \'' + instanceId + '\', \'' + item.action + '\', \'' + escapedInstanceName + '\')">' +
                        '<i class="bi ' + item.icon + '"></i>' + item.label +
                    '</button>';
                }
            });
            html += '</div>';

            openModal(html, { title: (instanceName || instanceId), size: 'small' });
        }

        async function handleEC2ActionClick(button, instanceId, action, instanceName) {
            // Disable button and show loading
            button.disabled = true;
            const originalHTML = button.innerHTML;
            button.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>Processing...';
            
            closeAllModals();
            await performEC2Action(instanceId, action, instanceName);
        }

        // Make functions globally accessible
        window.performEC2Action = performEC2Action;
        window.showEC2ActionsMenu = showEC2ActionsMenu;
        window.handleEC2ActionClick = handleEC2ActionClick;

        // ====================================================================
        // TIER 1 EC2 ACTIONS - Modular Handlers
        // ====================================================================

        async function handleTier1Action(instanceId, instanceName, action, state) {
            closeModal();
            
            switch (action) {
                case 'terminate':
                    showTerminateInstanceModal(instanceId, instanceName);
                    break;
                case 'create-snapshot':
                    showCreateSnapshotModal(instanceId, instanceName);
                    break;
                case 'security-groups':
                    showManageSecurityGroupsModal(instanceId, instanceName);
                    break;
                case 'elastic-ip':
                    showElasticIPModal(instanceId, instanceName);
                    break;
                default:
                    showToast('❌ Unknown action: ' + action, 'error');
            }
        }

        function showTerminateInstanceModal(instanceId, instanceName) {
            const content = `
                <div class="delete-modal-content">
                    <div class="delete-icon-wrapper">
                        <i class="bi bi-exclamation-triangle delete-icon" style="color: var(--danger);"></i>
                    </div>
                    <h5 class="delete-title">Terminate Instance?</h5>
                    <p class="delete-description">You're about to permanently delete this EC2 instance. This action <strong>CANNOT BE UNDONE</strong>.</p>
                    <div class="delete-filename">
                        <code>${instanceName || instanceId}</code>
                    </div>
                    <div class="delete-warning">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <span>All data on instance stores will be lost. EBS volumes may be retained based on DeleteOnTermination settings.</span>
                    </div>
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-warning); border-radius: 8px; padding: 12px; margin-top: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="confirmTerminate" style="width: 18px; height: 18px;">
                            <span style="font-size: 13px; color: var(--text-secondary);">I understand this action is permanent</span>
                        </label>
                    </div>
                </div>
                
                <div class="btn-group" style="margin-top: 20px;">
                    <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn-custom btn-danger" onclick="confirmTerminateInstance('${instanceId}', '${(instanceName || '').replace(/'/g, "\\'")}')">
                        <i class="bi bi-trash"></i> Terminate Instance
                    </button>
                </div>
            `;
            
            openModal(content, { title: 'Terminate Instance', size: 'small' });
        }

        async function confirmTerminateInstance(instanceId, instanceName) {
            const checkbox = document.getElementById('confirmTerminate');
            if (!checkbox || !checkbox.checked) {
                showToast('⚠️ Please confirm you understand this action', 'warning');
                return;
            }
            
            const btn = event.target.closest('button');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> Terminating...';
            }
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=terminate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    closeModal();
                    showToast('✓ Instance terminating: ' + (instanceName || instanceId), 'success');
                    setTimeout(() => loadDashboard(), 2000);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to terminate instance'), 'error');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-trash"></i> Terminate Instance';
                    }
                }
            } catch (error) {
                console.error('Terminate error:', error);
                showToast('❌ Network error', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-trash"></i> Terminate Instance';
                }
            }
        }

        async function showConsoleOutputModal(instanceId, instanceName) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading console output...</p>
                </div>
            `;
            openModal(loadingContent, { title: instanceName || instanceId, size: 'large' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=consoleOutput&instanceId=${instanceId}&userId=${userId}&region=${REGION}`);
                const data = await response.json();

                if (data.success) {
                    const output = data.data.output || 'No console output available';
                    const content = `
                        <div style="display: flex; flex-direction: column; height: 100%;">
                            <div style="flex: 1; background: #1e1e1e; border-radius: 8px; padding: 16px; overflow: auto; min-height: 0; max-height: calc(70vh - 150px);">
                                <pre style="margin: 0; color: #d4d4d4; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4; white-space: pre; overflow-x: auto;">${output}</pre>
                            </div>
                            <div style="margin-top: 16px; display: flex; gap: 12px; flex-shrink: 0;">
                                <button class="btn-custom btn-secondary" onclick="copyConsoleOutput()"><i class="bi bi-clipboard"></i> Copy Output</button>
                                <button class="btn-custom btn-secondary" onclick="closeModal()">Close</button>
                            </div>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    modalBody.style.padding = '20px';
                    modalBody.innerHTML = content;
                    window._consoleOutput = output; // Store for copying
                } else {
                    throw new Error(data.error || 'Failed to load console output');
                }
            } catch (error) {
                console.error('Console output error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; color: var(--danger); margin-bottom: 16px;">⚠️</div>
                        <h4>Failed to Load Console Output</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        function copyConsoleOutput() {
            const output = window._consoleOutput || '';
            if (navigator.clipboard) {
                navigator.clipboard.writeText(output).then(() => {
                    showToast('✓ Console output copied to clipboard', 'success');
                });
            } else {
                // Fallback
                const textarea = document.createElement('textarea');
                textarea.value = output;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showToast('✓ Console output copied to clipboard', 'success');
            }
        }

        async function showCreateSnapshotModal(instanceId, instanceName) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading volumes...</p>
                </div>
            `;
            openModal(loadingContent, { title: 'Create Snapshot', size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=listVolumes&instanceId=${instanceId}&userId=${userId}&region=${REGION}`);
                const data = await response.json();

                if (data.success && data.data.volumes && data.data.volumes.length > 0) {
                    const volumes = data.data.volumes;
                    let volumesHtml = '';
                    volumes.forEach((vol, idx) => {
                        volumesHtml += `
                            <label class="volume-option" style="display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 8px; cursor: pointer;">
                                <input type="radio" name="volumeId" value="${vol.volumeId}" ${idx === 0 ? 'checked' : ''} style="width: 18px; height: 18px;">
                                <div style="flex: 1;">
                                    <div style="font-weight: 600; color: var(--text-primary);">${vol.device || vol.volumeId}</div>
                                    <div style="font-size: 12px; color: var(--text-muted);">${vol.size} GB • ${vol.type} • ${vol.state}</div>
                                </div>
                            </label>
                        `;
                    });
                    
                    const content = `
                        <div style="padding: 20px;">
                            <h5 style="margin-bottom: 16px;">Select Volume to Snapshot</h5>
                            ${volumesHtml}
                            
                            <div style="margin-top: 20px;">
                                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Description (optional)</label>
                                <input type="text" id="snapshotDesc" placeholder="Snapshot of ${instanceName || instanceId}" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                            </div>
                            
                            <div style="display: flex; gap: 12px; margin-top: 20px;">
                                <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                                <button class="btn-custom btn-primary" onclick="confirmCreateSnapshot('${instanceId}', '${(instanceName || '').replace(/'/g, "\\'")}')">
                                    <i class="bi bi-camera"></i> Create Snapshot
                                </button>
                            </div>
                        </div>
                    `;
                    
                    document.getElementById('customModalBody').innerHTML = content;
                } else {
                    throw new Error('No volumes found for this instance');
                }
            } catch (error) {
                console.error('List volumes error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4>No Volumes Found</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function confirmCreateSnapshot(instanceId, instanceName) {
            const volumeId = document.querySelector('input[name="volumeId"]:checked')?.value;
            const description = document.getElementById('snapshotDesc')?.value || `Snapshot of ${instanceName || instanceId}`;
            
            if (!volumeId) {
                showToast('⚠️ Please select a volume', 'warning');
                return;
            }
            
            const btn = event.target.closest('button');
            const originalBtnHtml = btn?.innerHTML;
            
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div class="spinner-border" role="status" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; margin-right: 8px;"></div> Creating...';
            }
            
            showToast('⏳ Creating snapshot...', 'info');
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=createSnapshot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ volumeId, description, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-check-lg" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Snapshot Created Successfully!</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Snapshot ID:</p>
                            <code style="background: var(--bg-secondary); padding: 8px 16px; border-radius: 6px; font-family: monospace; color: var(--aws-orange); font-size: 13px;">${data.data.snapshotId}</code>
                            <p style="font-size: 13px; color: var(--text-muted); margin-top: 16px;">The snapshot is being created in the background.</p>
                            <button class="btn-custom btn-primary" onclick="closeModal()" style="margin-top: 24px;">Close</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = successContent;
                    showToast('✅ Snapshot creation started!', 'success');
                } else {
                    showToast('❌ ' + (data.error || 'Failed to create snapshot'), 'error');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalBtnHtml;
                    }
                }
            } catch (error) {
                console.error('Create snapshot error:', error);
                showToast('❌ Network error', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
            }
        }

        function showCreateAMIModal(instanceId, instanceName) {
            const content = `
                <div style="padding: 20px;">
                    <h5 style="margin-bottom: 16px;">Create Custom AMI</h5>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">AMI Name *</label>
                        <input type="text" id="amiName" placeholder="my-custom-ami-${Date.now()}" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Description (optional)</label>
                        <input type="text" id="amiDesc" placeholder="AMI created from ${instanceName || instanceId}" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                    </div>
                    
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="noReboot" style="width: 18px; height: 18px;">
                            <span style="font-size: 13px; color: var(--text-secondary);">Create without rebooting (faster but less consistent)</span>
                        </label>
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                        <button class="btn-custom btn-primary" onclick="confirmCreateAMI('${instanceId}', '${(instanceName || '').replace(/'/g, "\\'")}')">
                            <i class="bi bi-box-seam"></i> Create AMI
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Create AMI', size: 'medium' });
        }

        async function confirmCreateAMI(instanceId, instanceName) {
            const amiName = document.getElementById('amiName')?.value?.trim();
            const description = document.getElementById('amiDesc')?.value || `AMI created from ${instanceName || instanceId}`;
            const noReboot = document.getElementById('noReboot')?.checked || false;
            
            if (!amiName) {
                showToast('⚠️ Please enter an AMI name', 'warning');
                document.getElementById('amiName')?.focus();
                return;
            }
            
            const btn = event.target.closest('button');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> Creating...';
            }
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=createImage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId, name: amiName, description, noReboot, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    closeModal();
                    showToast(`✓ AMI ${data.data.imageId} creation started`, 'success');
                } else {
                    showToast('❌ ' + (data.error || 'Failed to create AMI'), 'error');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="bi bi-box-seam"></i> Create AMI';
                    }
                }
            } catch (error) {
                console.error('Create AMI error:', error);
                showToast('❌ Network error', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-box-seam"></i> Create AMI';
                }
            }
        }

        async function showElasticIPModal(instanceId, instanceName) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading Elastic IPs...</p>
                </div>
            `;
            openModal(loadingContent, { title: 'Elastic IP Management', size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=listElasticIps&userId=${userId}&region=${REGION}`);
                const data = await response.json();

                if (data.success) {
                    const ips = data.data.elasticIps || [];
                    
                    let ipsHtml = '';
                    if (ips.length > 0) {
                        ipsHtml = ips.map(ip => {
                            const publicIp = ip.publicIp || ip.PublicIp || 'N/A';
                            const allocationId = ip.allocationId || ip.AllocationId || '';
                            const associationId = ip.associationId || ip.AssociationId || '';
                            const instanceIdAssoc = ip.instanceId || ip.InstanceId || '';
                            const status = associationId ? 'Associated' : 'Available';
                            
                            return `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 8px; background: var(--bg-secondary);">
                                <div>
                                    <div style="font-weight: 600; color: var(--text-primary); font-family: monospace;">${publicIp}</div>
                                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${status}${instanceIdAssoc ? ' • ' + instanceIdAssoc : ''}</div>
                                </div>
                                ${!associationId ? `
                                    <button class="btn-custom btn-primary" onclick="window.associateElasticIP('${instanceId}', '${allocationId}')" style="padding: 6px 12px; font-size: 12px;">
                                        Associate
                                    </button>
                                ` : `
                                    <button class="btn-custom btn-danger" onclick="window.disassociateElasticIP('${associationId}', '${instanceId}')" style="padding: 6px 12px; font-size: 12px;">
                                        Disassociate
                                    </button>
                                `}
                            </div>
                        `;
                        }).join('');
                    } else {
                        ipsHtml = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No Elastic IPs available</p>';
                    }
                    
                    const content = `
                        <div style="padding: 20px;">
                            <h5 style="margin-bottom: 16px;">Available Elastic IPs</h5>
                            ${ipsHtml}
                            <div style="display: flex; gap: 12px; margin-top: 20px;">
                                <button class="btn-custom btn-secondary" onclick="allocateNewElasticIP('${instanceId}')">
                                    <i class="bi bi-plus-circle"></i> Allocate New IP
                                </button>
                                <button class="btn-custom btn-secondary" onclick="closeModal()">Close</button>
                            </div>
                        </div>
                    `;
                    
                    document.getElementById('customModalBody').innerHTML = content;
                } else {
                    throw new Error(data.error || 'Failed to load Elastic IPs');
                }
            } catch (error) {
                console.error('Elastic IP error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4>Failed to Load Elastic IPs</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function associateElasticIP(instanceId, allocationId) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Associating Elastic IP...</p>
                </div>
            `;
            document.getElementById('customModalBody').innerHTML = loadingContent;
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=associateElasticIp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId, allocationId, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                            <h4>Elastic IP Associated</h4>
                            <p style="color: var(--text-secondary);">The Elastic IP has been associated successfully!</p>
                            <button class="btn-custom btn-primary" onclick="location.reload()" style="margin-top: 20px;">Refresh Dashboard</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = successContent;
                } else {
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                            <h4>Failed to Associate IP</h4>
                            <p style="color: var(--text-secondary);">${data.error || 'Failed to associate IP'}</p>
                            <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = errorContent;
                }
            } catch (error) {
                console.error('Associate IP error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                        <h4>Network Error</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function disassociateElasticIP(associationId, instanceId) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Disassociating Elastic IP...</p>
                </div>
            `;
            document.getElementById('customModalBody').innerHTML = loadingContent;
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=disassociateElasticIp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ associationId, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                            <h4>Elastic IP Disassociated</h4>
                            <p style="color: var(--text-secondary);">The Elastic IP has been disassociated successfully!</p>
                            <button class="btn-custom btn-primary" onclick="location.reload()" style="margin-top: 20px;">Refresh Dashboard</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = successContent;
                } else {
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                            <h4>Failed to Disassociate IP</h4>
                            <p style="color: var(--text-secondary);">${data.error || 'Failed to disassociate IP'}</p>
                            <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = errorContent;
                }
            } catch (error) {
                console.error('Disassociate IP error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                        <h4>Network Error</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function allocateNewElasticIP(instanceId) {
            showToast('⏳ Allocating new Elastic IP...', 'info');
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=allocateElasticIp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('✅ Elastic IP allocated: ' + data.data.publicIp, 'success');
                    // Reload modal to show new IP
                    showElasticIPModal(instanceId);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to allocate IP'), 'error');
                }
            } catch (error) {
                console.error('Allocate IP error:', error);
                showToast('❌ Network error', 'error');
            }
        }

        async function disassociateElasticIP(associationId, instanceId) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Disassociating Elastic IP...</p>
                </div>
            `;
            document.getElementById('customModalBody').innerHTML = loadingContent;
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=disassociateElasticIp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ associationId, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
                            <h4>Elastic IP Disassociated</h4>
                            <p style="color: var(--text-secondary);">The Elastic IP has been disassociated successfully!</p>
                            <button class="btn-custom btn-primary" onclick="location.reload()" style="margin-top: 20px;">Refresh Dashboard</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = successContent;
                } else {
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                            <h4>Failed to Disassociate IP</h4>
                            <p style="color: var(--text-secondary);">${data.error || 'Failed to disassociate IP'}</p>
                            <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                        </div>
                    `;
                    document.getElementById('customModalBody').innerHTML = errorContent;
                }
            } catch (error) {
                console.error('Disassociate IP error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                        <h4>Network Error</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="window.showElasticIPModal('${instanceId}')" style="margin-top: 20px;">Try Again</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function showModifyInstanceTypeModal(instanceId, instanceName, state) {
            // Check if instance is stopped
            const instanceRow = document.querySelector(`[data-instance-id="${instanceId}"]`);
            const instanceState = instanceRow?.dataset?.instanceState || state || 'unknown';
            
            if (instanceState !== 'stopped') {
                const content = `
                    <div style="padding: 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4>Instance Must Be Stopped</h4>
                        <p style="color: var(--text-secondary); margin: 16px 0;">
                            You can only modify the instance type when the instance is in a <strong>stopped</strong> state.
                        </p>
                        <p style="color: var(--text-muted); font-size: 13px;">
                            Current state: <strong style="text-transform: capitalize;">${instanceState}</strong>
                        </p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                openModal(content, { title: 'Modify Instance Type', size: 'medium' });
                return;
            }
            
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading instance types...</p>
                </div>
            `;
            openModal(loadingContent, { title: 'Modify Instance Type', size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=listInstanceTypes&userId=${userId}&region=${REGION}`);
                const data = await response.json();

                if (data.success) {
                    let types = data.data.instanceTypes || [];
                    
                    // Handle if types is an object array
                    if (types.length > 0 && typeof types[0] === 'object') {
                        types = types.map(t => t.InstanceType || t.instanceType || t);
                    }
                    
                    // Common instance types grouped
                    const commonTypes = ['t2.micro', 't2.small', 't2.medium', 't3.micro', 't3.small', 't3.medium', 't3.large'];
                    
                    let typesHtml = '<select id="newInstanceType" style="width: 100%; padding: 10px 12px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px; font-family: monospace;">';
                    typesHtml += '<optgroup label="Common Types">';
                    commonTypes.forEach(type => {
                        if (types.includes(type)) {
                            typesHtml += `<option value="${type}">${type}</option>`;
                        }
                    });
                    typesHtml += '</optgroup>';
                    typesHtml += '<optgroup label="All Available Types">';
                    types.slice(0, 50).forEach(type => {
                        if (!commonTypes.includes(type)) {
                            typesHtml += `<option value="${type}">${type}</option>`;
                        }
                    });
                    typesHtml += '</optgroup></select>';
                    
                    const content = `
                        <div style="padding: 20px;">
                            <h5 style="margin-bottom: 16px;">Change Instance Type</h5>
                            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
                                Select a new instance type for <strong>${instanceName || instanceId}</strong>
                            </p>
                            
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; margin-bottom: 8px; font-weight: 500;">New Instance Type</label>
                                ${typesHtml}
                            </div>
                            
                            <div style="background: rgba(255, 179, 0, 0.1); border: 1px solid rgba(255, 179, 0, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                                <div style="display: flex; align-items: start; gap: 10px;">
                                    <i class="bi bi-info-circle" style="color: var(--status-warning); font-size: 16px; margin-top: 2px;"></i>
                                    <div style="font-size: 12px; color: var(--text-secondary);">
                                        <strong style="color: var(--text-primary);">Note:</strong> Changing instance type may affect pricing. The instance must remain stopped during this operation.
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 12px;">
                                <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                                <button class="btn-custom btn-primary" onclick="confirmModifyInstanceType('${instanceId}', '${(instanceName || '').replace(/'/g, "\\'")}')">
                                    <i class="bi bi-arrow-repeat"></i> Change Type
                                </button>
                            </div>
                        </div>
                    `;
                    
                    document.getElementById('customModalBody').innerHTML = content;
                } else {
                    throw new Error(data.error || 'Failed to load instance types');
                }
            } catch (error) {
                console.error('List instance types error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4>Failed to Load Instance Types</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        async function confirmModifyInstanceType(instanceId, instanceName) {
            const newInstanceType = document.getElementById('newInstanceType')?.value;
            
            if (!newInstanceType) {
                showToast('⚠️ Please select an instance type', 'warning');
                return;
            }
            
            const btn = event.target.closest('button');
            const originalBtnHtml = btn?.innerHTML;
            
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div class="spinner-border" role="status" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; margin-right: 8px;"></div> Changing...';
            }
            
            showToast('⏳ Modifying instance type...', 'info');
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=modifyInstanceType`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ instanceId, newInstanceType, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    closeModal();
                    showToast(`✅ Instance type changed to ${newInstanceType}`, 'success');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to modify instance type'), 'error');
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalBtnHtml;
                    }
                }
            } catch (error) {
                console.error('Modify instance type error:', error);
                showToast('❌ Network error', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
            }
        }

        // ============================================
        // SECURITY GROUP MANAGEMENT
        // ============================================
        
        async function showManageSecurityGroupsModal(instanceId, instanceName) {
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;"></div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading security groups...</p>
                </div>
            `;
            openModal(loadingContent, { title: 'Manage Security Groups', size: 'xlarge' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=getSecurityGroups&instanceId=${instanceId}&userId=${userId}&region=${REGION}`);
                const data = await response.json();

                if (data.success) {
                    const securityGroups = data.data.securityGroups || [];
                    
                    if (securityGroups.length === 0) {
                        const content = `
                            <div style="text-align: center; padding: 40px;">
                                <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
                                <h4>No Security Groups</h4>
                                <p style="color: var(--text-secondary);">This instance has no security groups attached.</p>
                                <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                            </div>
                        `;
                        document.getElementById('customModalBody').innerHTML = content;
                        return;
                    }
                    
                    // Build tabs for each security group
                    let tabsHtml = '<div style="display: flex; gap: 8px; border-bottom: 2px solid var(--border-primary); margin-bottom: 20px; padding: 0 20px;">';
                    securityGroups.forEach((sg, index) => {
                        tabsHtml += `<button class="sg-tab ${index === 0 ? 'active' : ''}" onclick="switchSecurityGroupTab('${sg.groupId}')" data-group-id="${sg.groupId}" style="padding: 12px 20px; border: none; background: ${index === 0 ? 'var(--bg-secondary)' : 'transparent'}; color: var(--text-primary); cursor: pointer; border-bottom: 2px solid ${index === 0 ? 'var(--aws-orange)' : 'transparent'}; margin-bottom: -2px; border-radius: 8px 8px 0 0; font-weight: 500;">${sg.groupName}</button>`;
                    });
                    tabsHtml += '</div>';
                    
                    // Store security groups data globally for tab switching
                    window.securityGroupsData = securityGroups;
                    window.currentInstanceId = instanceId;
                    
                    const content = `
                        <div style="padding-bottom: 20px;">
                            ${tabsHtml}
                            <div id="sg-content" style="padding: 0 20px;"></div>
                        </div>
                    `;
                    
                    document.getElementById('customModalBody').innerHTML = content;
                    
                    // Show first security group by default
                    switchSecurityGroupTab(securityGroups[0].groupId);
                    
                } else {
                    throw new Error(data.error || 'Failed to load security groups');
                }
            } catch (error) {
                console.error('Security groups error:', error);
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <h4>Failed to Load Security Groups</h4>
                        <p style="color: var(--text-secondary);">${error.message}</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                document.getElementById('customModalBody').innerHTML = errorContent;
            }
        }

        function switchSecurityGroupTab(groupId) {
            // Update active tab styling
            document.querySelectorAll('.sg-tab').forEach(tab => {
                const isActive = tab.dataset.groupId === groupId;
                tab.style.background = isActive ? 'var(--bg-secondary)' : 'transparent';
                tab.style.borderBottomColor = isActive ? 'var(--aws-orange)' : 'transparent';
            });
            
            // Find the security group data
            const sg = window.securityGroupsData.find(g => g.groupId === groupId);
            if (!sg) return;
            
            // Render inbound and outbound rules
            let inboundHtml = '<div class="rules-list">';
            if (sg.inboundRules.length === 0) {
                inboundHtml += '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No inbound rules</p>';
            } else {
                sg.inboundRules.forEach((rule, index) => {
                    const protocol = rule.ipProtocol === '-1' ? 'All' : rule.ipProtocol.toUpperCase();
                    const ports = rule.fromPort ? (rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}-${rule.toPort}`) : 'All';
                    const source = rule.ipRanges.join(', ') || rule.securityGroups.join(', ') || 'N/A';
                    
                    inboundHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 8px; background: var(--bg-secondary);">
                            <div style="flex: 1;">
                                <div style="display: flex; gap: 16px; font-family: monospace; font-size: 13px;">
                                    <span><strong>Protocol:</strong> ${protocol}</span>
                                    <span><strong>Ports:</strong> ${ports}</span>
                                    <span><strong>Source:</strong> ${source}</span>
                                </div>
                                ${rule.description ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${rule.description}</div>` : ''}
                            </div>
                            <button class="btn-custom btn-danger btn-sm" onclick="removeSecurityGroupRule('${groupId}', 'inbound', ${index})" style="padding: 6px 12px; font-size: 12px;">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    `;
                });
            }
            inboundHtml += '</div>';
            
            let outboundHtml = '<div class="rules-list">';
            if (sg.outboundRules.length === 0) {
                outboundHtml += '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No outbound rules</p>';
            } else {
                sg.outboundRules.forEach((rule, index) => {
                    const protocol = rule.ipProtocol === '-1' ? 'All' : rule.ipProtocol.toUpperCase();
                    const ports = rule.fromPort ? (rule.fromPort === rule.toPort ? rule.fromPort : `${rule.fromPort}-${rule.toPort}`) : 'All';
                    const destination = rule.ipRanges.join(', ') || rule.securityGroups.join(', ') || 'N/A';
                    
                    outboundHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; margin-bottom: 8px; background: var(--bg-secondary);">
                            <div style="flex: 1;">
                                <div style="display: flex; gap: 16px; font-family: monospace; font-size: 13px;">
                                    <span><strong>Protocol:</strong> ${protocol}</span>
                                    <span><strong>Ports:</strong> ${ports}</span>
                                    <span><strong>Destination:</strong> ${destination}</span>
                                </div>
                                ${rule.description ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${rule.description}</div>` : ''}
                            </div>
                            <button class="btn-custom btn-danger btn-sm" onclick="removeSecurityGroupRule('${groupId}', 'outbound', ${index})" style="padding: 6px 12px; font-size: 12px;">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    `;
                });
            }
            outboundHtml += '</div>';
            
            // Render the content with sub-tabs for inbound/outbound
            const content = `
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
                        <i class="bi bi-shield-check" style="font-size: 20px; color: var(--aws-orange);"></i>
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary);">${sg.groupName}</div>
                            <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${sg.groupId}</div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border-primary);">
                        <button class="rule-type-tab active" onclick="switchRuleType('inbound', '${groupId}')" data-type="inbound" style="padding: 8px 16px; border: none; background: transparent; color: var(--text-primary); cursor: pointer; border-bottom: 2px solid var(--aws-orange); font-weight: 500;">
                            <i class="bi bi-arrow-down-circle"></i> Inbound Rules (${sg.inboundRules.length})
                        </button>
                        <button class="rule-type-tab" onclick="switchRuleType('outbound', '${groupId}')" data-type="outbound" style="padding: 8px 16px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent;">
                            <i class="bi bi-arrow-up-circle"></i> Outbound Rules (${sg.outboundRules.length})
                        </button>
                    </div>
                    
                    <div id="inbound-rules" style="display: block;">
                        ${inboundHtml}
                        <button class="btn-custom btn-primary" onclick="showAddRuleForm('${groupId}', 'inbound')" style="width: 100%; margin-top: 12px;">
                            <i class="bi bi-plus-circle"></i> Add Inbound Rule
                        </button>
                    </div>
                    
                    <div id="outbound-rules" style="display: none;">
                        ${outboundHtml}
                        <button class="btn-custom btn-primary" onclick="showAddRuleForm('${groupId}', 'outbound')" style="width: 100%; margin-top: 12px;">
                            <i class="bi bi-plus-circle"></i> Add Outbound Rule
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('sg-content').innerHTML = content;
        }

        function switchRuleType(type, groupId) {
            // Update tab styling
            document.querySelectorAll('.rule-type-tab').forEach(tab => {
                const isActive = tab.dataset.type === type;
                tab.style.borderBottomColor = isActive ? 'var(--aws-orange)' : 'transparent';
                tab.style.color = isActive ? 'var(--text-primary)' : 'var(--text-secondary)';
                tab.style.fontWeight = isActive ? '500' : '400';
            });
            
            // Show/hide rule sections
            document.getElementById('inbound-rules').style.display = type === 'inbound' ? 'block' : 'none';
            document.getElementById('outbound-rules').style.display = type === 'outbound' ? 'block' : 'none';
        }

        function showAddRuleForm(groupId, ruleType) {
            const formHtml = `
                <div style="padding: 20px; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 8px; margin-top: 16px;">
                    <h6 style="margin-bottom: 16px;">Add ${ruleType === 'inbound' ? 'Inbound' : 'Outbound'} Rule</h6>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500;">Protocol</label>
                            <select id="newRuleProtocol" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 13px;">
                                <option value="tcp">TCP</option>
                                <option value="udp">UDP</option>
                                <option value="icmp">ICMP</option>
                                <option value="-1">All Traffic</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500;">Port Range</label>
                            <input type="text" id="newRulePorts" placeholder="80 or 80-443" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 13px;">
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500;">${ruleType === 'inbound' ? 'Source' : 'Destination'} CIDR</label>
                        <input type="text" id="newRuleCidr" placeholder="0.0.0.0/0" value="0.0.0.0/0" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 13px; font-family: monospace;">
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500;">Description (optional)</label>
                        <input type="text" id="newRuleDescription" placeholder="Rule description" style="width: 100%; padding: 8px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 13px;">
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="switchSecurityGroupTab('${groupId}')" style="flex: 1;">Cancel</button>
                        <button class="btn-custom btn-primary" onclick="confirmAddRule('${groupId}', '${ruleType}')" style="flex: 1;">
                            <i class="bi bi-plus-circle"></i> Add Rule
                        </button>
                    </div>
                </div>
            `;
            
            // Append form to the current rules section
            const targetDiv = ruleType === 'inbound' ? 'inbound-rules' : 'outbound-rules';
            const rulesDiv = document.getElementById(targetDiv);
            const existingForm = rulesDiv.querySelector('.add-rule-form');
            if (existingForm) existingForm.remove();
            
            const formContainer = document.createElement('div');
            formContainer.className = 'add-rule-form';
            formContainer.innerHTML = formHtml;
            rulesDiv.appendChild(formContainer);
        }

        async function confirmAddRule(groupId, ruleType) {
            const protocol = document.getElementById('newRuleProtocol')?.value;
            const ports = document.getElementById('newRulePorts')?.value.trim();
            const cidr = document.getElementById('newRuleCidr')?.value.trim();
            const description = document.getElementById('newRuleDescription')?.value.trim();
            
            if (!cidr) {
                showToast('⚠️ CIDR is required', 'warning');
                return;
            }
            
            // Parse port range
            let fromPort, toPort;
            if (protocol === '-1') {
                fromPort = -1;
                toPort = -1;
            } else if (ports.includes('-')) {
                [fromPort, toPort] = ports.split('-').map(p => parseInt(p.trim()));
            } else if (ports) {
                fromPort = toPort = parseInt(ports);
            } else {
                showToast('⚠️ Port range is required', 'warning');
                return;
            }
            
            const rule = {
                protocol: protocol,
                fromPort: fromPort,
                toPort: toPort,
                cidr: cidr,
                description: description
            };
            
            showToast('⏳ Adding rule...', 'info');
            
            try {
                const userId = getUserId();
                const action = ruleType === 'inbound' ? 'addInboundRule' : 'addOutboundRule';
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=${action}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId, rule, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('✅ Rule added successfully!', 'success');
                    // Reload security groups
                    showManageSecurityGroupsModal(window.currentInstanceId);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to add rule'), 'error');
                }
            } catch (error) {
                console.error('Add rule error:', error);
                showToast('❌ Network error', 'error');
            }
        }

        async function removeSecurityGroupRule(groupId, ruleType, ruleIndex) {
            const sg = window.securityGroupsData.find(g => g.groupId === groupId);
            if (!sg) return;
            
            const rules = ruleType === 'inbound' ? sg.inboundRules : sg.outboundRules;
            const rule = rules[ruleIndex];
            
            if (!confirm(`Remove this ${ruleType} rule?`)) return;
            
            showToast('⏳ Removing rule...', 'info');
            
            try {
                const userId = getUserId();
                const action = ruleType === 'inbound' ? 'removeInboundRule' : 'removeOutboundRule';
                
                const rulePayload = {
                    protocol: rule.ipProtocol,
                    fromPort: rule.fromPort || -1,
                    toPort: rule.toPort || -1,
                    cidr: rule.ipRanges[0] || '0.0.0.0/0'
                };
                
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/ec2?action=${action}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupId, rule: rulePayload, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    showToast('✅ Rule removed successfully!', 'success');
                    // Reload security groups
                    showManageSecurityGroupsModal(window.currentInstanceId);
                } else {
                    showToast('❌ ' + (data.error || 'Failed to remove rule'), 'error');
                }
            } catch (error) {
                console.error('Remove rule error:', error);
                showToast('❌ Network error', 'error');
            }
        }

        // Make Tier 1 functions globally accessible
        window.handleTier1Action = handleTier1Action;
        window.showTerminateInstanceModal = showTerminateInstanceModal;
        window.confirmTerminateInstance = confirmTerminateInstance;
        window.showCreateSnapshotModal = showCreateSnapshotModal;
        window.confirmCreateSnapshot = confirmCreateSnapshot;
        window.showElasticIPModal = showElasticIPModal;
        window.associateElasticIP = associateElasticIP;
        window.allocateNewElasticIP = allocateNewElasticIP;
        window.disassociateElasticIP = disassociateElasticIP;
        window.showModifyInstanceTypeModal = showModifyInstanceTypeModal;
        window.confirmModifyInstanceType = confirmModifyInstanceType;
        window.showManageSecurityGroupsModal = showManageSecurityGroupsModal;
        window.switchSecurityGroupTab = switchSecurityGroupTab;
        window.switchRuleType = switchRuleType;
        window.showAddRuleForm = showAddRuleForm;
        window.confirmAddRule = confirmAddRule;
        window.removeSecurityGroupRule = removeSecurityGroupRule;

        // ====================================================================
        // EC2 METRICS MODAL WITH CHARTS
        // ====================================================================

        async function showEC2Metrics(instanceId, instanceName) {
            // Close action menu modal first
            closeAllModals();
            
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading metrics...</p>
                </div>
            `;

            openModal(loadingContent, { title: `Metrics: ${instanceName || instanceId}`, size: 'large' });

            try {
                const userId = getUserId();
                const timeRange = '1h'; // Default to 1 hour

                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/ec2/metrics?instanceId=${instanceId}&timeRange=${timeRange}&userId=${userId}&region=${REGION}`
                );

                const data = await response.json();

                if (data.success) {
                    renderMetricsModal(data.data, instanceId, instanceName);
                } else {
                    throw new Error(data.error || 'Failed to load metrics');
                }
            } catch (error) {
                console.error('Metrics error:', error);
                const errorContent = `
                    <div class="metrics-error">
                        <p>Failed to load metrics: ${error.message}</p>
                    </div>
                `;
                openModal(errorContent, { title: `Metrics: ${instanceName || instanceId}`, size: 'large' });
            }
        }

        function renderMetricsModal(metricsData, instanceId, instanceName, currentTimeRange = '1h') {
            const timeRanges = ['1h', '6h', '24h', '7d'];
            const timeLabels = { '1h': '1 Hour', '6h': '6 Hours', '24h': '24 Hours', '7d': '7 Days' };
            
            let timeButtons = '';
            timeRanges.forEach(range => {
                const activeClass = range === currentTimeRange ? 'active' : '';
                timeButtons += '<button class="time-btn ' + activeClass + '" onclick="changeMetricsTimeRange(\'' + instanceId + '\', \'' + instanceName + '\', \'' + range + '\')">' + timeLabels[range] + '</button>';
            });
            
            const content = `
                <div class="metrics-container">
                    <!-- Time Range Selector -->
                    <div class="metrics-time-range">
                        ${timeButtons}
                    </div>

                    <!-- CPU Metrics -->
                    <div class="metric-card">
                        <div class="metric-header">
                            <h4>CPU Utilization</h4>
                            <div class="metric-stats">
                                <span>Avg: ${metricsData.metrics.cpu.average.toFixed(2)}%</span>
                                <span>Max: ${metricsData.metrics.cpu.max.toFixed(2)}%</span>
                            </div>
                        </div>
                        <div class="metric-chart">
                            ${renderSimpleChart(metricsData.metrics.cpu.data, 'cpu')}
                        </div>
                    </div>

                    <!-- Network In -->
                    <div class="metric-card">
                        <div class="metric-header">
                            <h4>Network In</h4>
                            <div class="metric-stats">
                                <span>Avg: ${formatBytes(metricsData.metrics.networkIn.average)}</span>
                                <span>Max: ${formatBytes(metricsData.metrics.networkIn.max)}</span>
                            </div>
                        </div>
                        <div class="metric-chart">
                            ${renderSimpleChart(metricsData.metrics.networkIn.data, 'network')}
                        </div>
                    </div>

                    <!-- Network Out -->
                    <div class="metric-card">
                        <div class="metric-header">
                            <h4>Network Out</h4>
                            <div class="metric-stats">
                                <span>Avg: ${formatBytes(metricsData.metrics.networkOut.average)}</span>
                                <span>Max: ${formatBytes(metricsData.metrics.networkOut.max)}</span>
                            </div>
                        </div>
                        <div class="metric-chart">
                            ${renderSimpleChart(metricsData.metrics.networkOut.data, 'network')}
                        </div>
                    </div>
                </div>
            `;

            openModal(content, { title: `Metrics: ${instanceName || instanceId}`, size: 'large' });
        }

        function renderSimpleChart(dataPoints, type) {
            if (!dataPoints || dataPoints.length === 0) {
                return '<p class="no-data">No data available</p>';
            }

            const max = Math.max(...dataPoints.map(d => d.value));
            const min = Math.min(...dataPoints.map(d => d.value));
            const range = max - min || 1;

            let svg = '<svg class="simple-chart" viewBox="0 0 400 100">';
            
            // Draw bars
            const barWidth = 400 / dataPoints.length;
            dataPoints.forEach((point, i) => {
                const height = ((point.value - min) / range) * 80 + 5;
                const x = i * barWidth;
                const y = 95 - height;
                
                const color = type === 'cpu' ? 'var(--aws-purple)' : 'var(--aws-blue)';
                svg += `<rect x="${x + 2}" y="${y}" width="${barWidth - 4}" height="${height}" fill="${color}" opacity="0.7" rx="2"/>`;
            });

            svg += '</svg>';
            return svg;
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const sizeIndex = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round((bytes / Math.pow(k, sizeIndex)) * 100) / 100 + ' ' + sizes[sizeIndex];
        }

        async function changeMetricsTimeRange(instanceId, instanceName, timeRange) {
            // Update active button
            document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');

            // Show loading state in modal body
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading metrics for ${timeRange}...</p>
                </div>
            `;
            const modalBody = document.getElementById('customModalBody');
            if (modalBody) {
                modalBody.innerHTML = loadingContent;
            }

            try {
                const userId = getUserId();
                const response = await fetch(
                    API_BASE + '/server/aws_handler/widget/ec2/metrics?instanceId=' + instanceId + '&timeRange=' + timeRange + '&userId=' + userId + '&region=' + REGION
                );

                const data = await response.json();

                if (data.success) {
                    renderMetricsModal(data.data, instanceId, instanceName, timeRange);
                } else {
                    throw new Error(data.error || 'Failed to load metrics');
                }
            } catch (error) {
                console.error('Metrics time range error:', error);
                showToast('❌ Failed to load metrics: ' + error.message, 'error');
                // Show error in modal
                if (modalBody) {
                    modalBody.innerHTML = `
                        <div class="metrics-error">
                            <p>Failed to load metrics: ${error.message}</p>
                        </div>
                    `;
                }
            }
        }

        window.showEC2Metrics = showEC2Metrics;
        window.changeMetricsTimeRange = changeMetricsTimeRange;

        // ====================================================================
        // LAMBDA FUNCTIONS MANAGEMENT
        // ====================================================================

        async function showLambdaActionsMenu(functionName) {
            const content = `
                <div class="action-menu">
                    <button class="action-item" onclick="invokeLambdaFunction('${functionName.replace(/'/g, "\\'")}')">
                        <i class="bi bi-play-circle"></i>
                        <div class="action-content">
                            <span class="action-title">Invoke Function</span>
                            <span class="action-desc">Test with payload</span>
                        </div>
                    </button>
                    <button class="action-item" onclick="viewLambdaConfiguration('${functionName.replace(/'/g, "\\'")}')">
                        <i class="bi bi-gear"></i>
                        <div class="action-content">
                            <span class="action-title">View Configuration</span>
                            <span class="action-desc">Runtime, memory, timeout</span>
                        </div>
                    </button>
                    <button class="action-item" onclick="viewLambdaLogs('${functionName.replace(/'/g, "\\'")}')">
                        <i class="bi bi-file-text"></i>
                        <div class="action-content">
                            <span class="action-title">View Logs</span>
                            <span class="action-desc">Recent CloudWatch logs</span>
                        </div>
                    </button>
                    <button class="action-item" onclick="updateLambdaEnvironment('${functionName.replace(/'/g, "\\'")}')">
                        <i class="bi bi-list-ul"></i>
                        <div class="action-content">
                            <span class="action-title">Update Environment Variables</span>
                            <span class="action-desc">Edit configuration</span>
                        </div>
                    </button>
                    <button class="action-item" onclick="updateLambdaCode('${functionName.replace(/'/g, "\\'")}')">
                        <i class="bi bi-upload"></i>
                        <div class="action-content">
                            <span class="action-title">Update Function Code</span>
                            <span class="action-desc">Upload new ZIP file</span>
                        </div>
                    </button>
                </div>
            `;
            openModal(content, { title: functionName, size: 'small' });
        }

        async function invokeLambdaFunction(functionName) {
            const content = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500;">Payload (JSON)</label>
                        <textarea id="lambdaPayload" rows="10" style="width: 100%; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-family: 'Courier New', monospace; font-size: 13px;" placeholder='{\n  "key": "value"\n}'></textarea>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Leave empty for no payload</div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                        <button class="btn-custom btn-primary" onclick="confirmInvokeLambda('${functionName.replace(/'/g, "\\'")}')">
                            <i class="bi bi-play-circle"></i> Invoke Function
                        </button>
                    </div>
                </div>
            `;
            openModal(content, { title: `Invoke: ${functionName}`, size: 'medium' });
        }

        async function confirmInvokeLambda(functionName) {
            const payloadText = document.getElementById('lambdaPayload').value.trim();
            let payload = {};
            
            if (payloadText) {
                try {
                    payload = JSON.parse(payloadText);
                } catch (e) {
                    showToast('❌ Invalid JSON payload', 'error');
                    return;
                }
            }
            
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Invoking function...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Invoking: ${functionName}`, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'invoke', 
                        functionName, 
                        payload,
                        userId, 
                        region: REGION 
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const invocation = data.invocation;
                    const content = `
                        <div style="padding: 20px;">
                            <div style="background: var(--bg-success); border: 1px solid var(--border-success); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <i class="bi bi-check-circle" style="color: var(--success); font-size: 24px;"></i>
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-primary);">Function Invoked Successfully</div>
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                            Status: ${invocation.statusCode} | Duration: ${invocation.duration}ms
                                            ${invocation.billedDuration ? ` | Billed: ${invocation.billedDuration}ms` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            ${invocation.functionError ? `
                                <div style="background: var(--bg-danger); border: 1px solid var(--border-danger); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                                    <div style="font-weight: 600; color: var(--danger); margin-bottom: 8px;">Function Error: ${invocation.functionError}</div>
                                </div>
                            ` : ''}
                            
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500;">Response</label>
                                <pre style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 12px; max-height: 300px;">${JSON.stringify(invocation.response, null, 2)}</pre>
                            </div>
                            
                            ${invocation.logs ? `
                                <div style="margin-bottom: 20px;">
                                    <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500;">Logs</label>
                                    <pre style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 12px; overflow-x: auto; font-size: 11px; max-height: 200px;">${invocation.logs}</pre>
                                </div>
                            ` : ''}
                            
                            <button class="btn-custom btn-primary" onclick="closeModal()" style="width: 100%;">Close</button>
                        </div>
                    `;
                    openModal(content, { title: `Result: ${functionName}`, size: 'large' });
                } else {
                    throw new Error(data.error || 'Failed to invoke function');
                }
            } catch (error) {
                console.error('Invoke error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        async function viewLambdaConfiguration(functionName) {
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading configuration...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Configuration: ${functionName}`, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'getConfiguration', 
                        functionName, 
                        userId, 
                        region: REGION 
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const fn = data.function;
                    const content = `
                        <div style="padding: 20px;">
                            <div class="config-grid" style="display: grid; gap: 16px;">
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Runtime</div>
                                    <div style="font-size: 16px; font-weight: 500;">${fn.runtime || 'N/A'}</div>
                                </div>
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Memory</div>
                                    <div style="font-size: 16px; font-weight: 500;">${fn.memory || 'N/A'} MB</div>
                                </div>
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Timeout</div>
                                    <div style="font-size: 16px; font-weight: 500;">${fn.timeout || 'N/A'} seconds</div>
                                </div>
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Handler</div>
                                    <div style="font-size: 14px; font-family: monospace;">${fn.handler || 'N/A'}</div>
                                </div>
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Code Size</div>
                                    <div style="font-size: 16px; font-weight: 500;">${fn.codeSizeFormatted || 'N/A'}</div>
                                </div>
                                <div style="background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Last Modified</div>
                                    <div style="font-size: 14px;">${fn.lastModified ? new Date(fn.lastModified).toLocaleString() : 'N/A'}</div>
                                </div>
                            </div>
                            
                            ${fn.description ? `
                                <div style="margin-top: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
                                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Description</div>
                                    <div>${fn.description}</div>
                                </div>
                            ` : ''}
                            
                            ${fn.environment && fn.environment.length > 0 ? `
                                <div style="margin-top: 16px;">
                                    <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">Environment Variables</div>
                                    <div style="background: var(--bg-secondary); border-radius: 8px; padding: 12px;">
                                        ${fn.environment.map(key => `<div style="font-family: monospace; font-size: 12px; padding: 4px 0;">${key}</div>`).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <button class="btn-custom btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
                        </div>
                    `;
                    openModal(content, { title: `Configuration: ${functionName}`, size: 'medium' });
                } else {
                    throw new Error(data.error || 'Failed to load configuration');
                }
            } catch (error) {
                console.error('Config error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        async function viewLambdaLogs(functionName) {
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading logs...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Logs: ${functionName}`, size: 'large' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'getLogs', 
                        functionName, 
                        userId, 
                        region: REGION,
                        limit: 100
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const logs = data.logs;
                    let content;
                    
                    if (logs.length === 0) {
                        content = `
                            <div class="empty-state">
                                <div class="empty-icon"><i class="bi bi-file-text" style="font-size: 48px;"></i></div>
                                <div class="empty-title">No Logs Found</div>
                                <div class="empty-text">No log entries in the last 24 hours</div>
                            </div>
                        `;
                    } else {
                        content = `
                            <div style="padding: 20px;">
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 16px; max-height: 500px; overflow-y: auto;">
                                    ${logs.map(log => `
                                        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-primary);">
                                            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${new Date(log.timestamp).toLocaleString()}</div>
                                            <div style="font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word;">${log.message}</div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div style="margin-top: 16px; font-size: 12px; color: var(--text-muted);">
                                    Showing last ${logs.length} log entries from the past 24 hours
                                </div>
                                <button class="btn-custom btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 16px;">Close</button>
                            </div>
                        `;
                    }
                    
                    openModal(content, { title: `Logs: ${functionName}`, size: 'large' });
                } else {
                    throw new Error(data.error || 'Failed to load logs');
                }
            } catch (error) {
                console.error('Logs error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        async function updateLambdaEnvironment(functionName) {
            // First fetch current configuration
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading configuration...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Update Environment: ${functionName}`, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'getConfiguration', 
                        functionName, 
                        userId, 
                        region: REGION 
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const fn = data.function;
                    const envVars = fn.environment || {};
                    
                    const content = `
                        <div style="padding: 20px;">
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500;">Environment Variables (JSON)</label>
                                <textarea id="lambdaEnvVars" rows="10" style="width: 100%; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-family: 'Courier New', monospace; font-size: 13px;">${JSON.stringify(envVars, null, 2)}</textarea>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Edit as JSON object</div>
                            </div>
                            <div style="display: flex; gap: 12px;">
                                <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                                <button class="btn-custom btn-primary" onclick="confirmUpdateLambdaEnvironment('${functionName.replace(/'/g, "\\'")}')">
                                    <i class="bi bi-check-circle"></i> Update Environment
                                </button>
                            </div>
                        </div>
                    `;
                    openModal(content, { title: `Update Environment: ${functionName}`, size: 'medium' });
                } else {
                    throw new Error(data.error || 'Failed to load configuration');
                }
            } catch (error) {
                console.error('Config error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        async function confirmUpdateLambdaEnvironment(functionName) {
            const envVarsText = document.getElementById('lambdaEnvVars').value.trim();
            let envVars;
            
            try {
                envVars = JSON.parse(envVarsText);
            } catch (e) {
                showToast('❌ Invalid JSON format', 'error');
                return;
            }
            
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Updating environment...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Updating: ${functionName}`, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'updateConfiguration', 
                        functionName, 
                        updates: {
                            Environment: {
                                Variables: envVars
                            }
                        },
                        userId, 
                        region: REGION 
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const content = `
                        <div style="padding: 20px; text-align: center;">
                            <div style="background: var(--bg-success); border: 1px solid var(--border-success); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                                <i class="bi bi-check-circle" style="color: var(--success); font-size: 48px;"></i>
                                <div style="font-weight: 600; color: var(--text-primary); margin-top: 12px;">Environment Updated Successfully</div>
                            </div>
                            <button class="btn-custom btn-primary" onclick="loadDashboard(); closeModal();" style="width: 100%;">
                                <i class="bi bi-arrow-clockwise"></i> Refresh Dashboard
                            </button>
                        </div>
                    `;
                    openModal(content, { title: `Success`, size: 'small' });
                } else {
                    throw new Error(data.error || 'Failed to update environment');
                }
            } catch (error) {
                console.error('Update error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        async function updateLambdaCode(functionName) {
            closeAllModals();
            
            const content = `
                <div style="padding: 20px;">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 500;">Upload ZIP File</label>
                        <input type="file" id="lambdaZipFile" accept=".zip" style="width: 100%; padding: 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary);">
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">Select a ZIP file containing your Lambda function code</div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()">Cancel</button>
                        <button class="btn-custom btn-primary" onclick="confirmUpdateLambdaCode('${functionName.replace(/'/g, "\\'")}')">
                            <i class="bi bi-upload"></i> Upload Code
                        </button>
                    </div>
                </div>
            `;
            openModal(content, { title: `Update Code: ${functionName}`, size: 'medium' });
        }

        async function confirmUpdateLambdaCode(functionName) {
            const fileInput = document.getElementById('lambdaZipFile');
            const file = fileInput.files[0];
            
            if (!file) {
                showToast('❌ Please select a ZIP file', 'error');
                return;
            }
            
            if (!file.name.endsWith('.zip')) {
                showToast('❌ File must be a ZIP archive', 'error');
                return;
            }
            
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Uploading code...</p>
                </div>
            `;
            openModal(loadingContent, { title: `Uploading: ${functionName}`, size: 'medium' });
            
            try {
                const userId = getUserId();
                const formData = new FormData();
                formData.append('zipFile', file);
                formData.append('action', 'updateCode');
                formData.append('functionName', functionName);
                formData.append('userId', userId);
                formData.append('region', REGION);
                
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/lambda`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const content = `
                        <div style="padding: 20px; text-align: center;">
                            <div style="background: var(--bg-success); border: 1px solid var(--border-success); border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                                <i class="bi bi-check-circle" style="color: var(--success); font-size: 48px;"></i>
                                <div style="font-weight: 600; color: var(--text-primary); margin-top: 12px;">Code Updated Successfully</div>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">New code size: ${data.function.codeSizeFormatted || 'N/A'}</div>
                            </div>
                            <button class="btn-custom btn-primary" onclick="loadDashboard(); closeModal();" style="width: 100%;">
                                <i class="bi bi-arrow-clockwise"></i> Refresh Dashboard
                            </button>
                        </div>
                    `;
                    openModal(content, { title: `Success`, size: 'small' });
                } else {
                    throw new Error(data.error || 'Failed to update code');
                }
            } catch (error) {
                console.error('Upload error:', error);
                showToast(`❌ ${error.message}`, 'error');
                closeModal();
            }
        }

        // Export Lambda functions to window
        window.showLambdaActionsMenu = showLambdaActionsMenu;
        window.invokeLambdaFunction = invokeLambdaFunction;
        window.confirmInvokeLambda = confirmInvokeLambda;
        window.viewLambdaConfiguration = viewLambdaConfiguration;
        window.viewLambdaLogs = viewLambdaLogs;
        window.updateLambdaEnvironment = updateLambdaEnvironment;
        window.confirmUpdateLambdaEnvironment = confirmUpdateLambdaEnvironment;
        window.updateLambdaCode = updateLambdaCode;
        window.confirmUpdateLambdaCode = confirmUpdateLambdaCode;

        // ====================================================================
        // S3 BROWSER MODAL
        // ====================================================================

        async function browseS3Bucket(bucketName) {
            const loadingContent = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>Loading bucket contents...</p>
                </div>
            `;

            openModal(loadingContent, { title: `Browse: ${bucketName}`, size: 'large' });

            try {
                await loadS3BrowserContent(bucketName, '');
            } catch (error) {
                console.error('S3 browse error:', error);
                showToast('Failed to load bucket', 'error');
            }
        }

        async function loadS3BrowserContent(bucketName, prefix) {
            const userId = getUserId();
            const url = `${API_BASE}/server/aws_handler/widget/s3/browse?bucket=${encodeURIComponent(bucketName)}&prefix=${encodeURIComponent(prefix)}&userId=${userId}&region=${REGION}&maxKeys=5`;

            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load bucket');
            }

            renderS3Browser(bucketName, prefix, data.data);
        }

        function renderS3Browser(bucketName, prefix, data) {
            // Build breadcrumb
            const pathParts = prefix ? prefix.split('/').filter(p => p) : [];
            let breadcrumbItems = `<li class="breadcrumb-item">
                <a href="#" class="breadcrumb-link" onclick="loadS3BrowserContent('${bucketName}', ''); return false;">
                    <i class="bi bi-bucket"></i>${bucketName}
                </a>
            </li>`;
            let currentPath = '';
            pathParts.forEach((part, i) => {
                currentPath += part + '/';
                const isLast = i === pathParts.length - 1;
                if (isLast) {
                    breadcrumbItems += `<li class="breadcrumb-item breadcrumb-current">${part}</li>`;
                } else {
                    breadcrumbItems += `<li class="breadcrumb-item">
                        <a href="#" class="breadcrumb-link" onclick="loadS3BrowserContent('${bucketName}', '${currentPath}'); return false;">${part}</a>
                    </li>`;
                }
            });

            const content = `
                <div class="s3-browser">
                    <!-- Toolbar -->
                    <div class="s3-browser-header">
                        <nav class="s3-breadcrumb">
                            <ol class="breadcrumb">${breadcrumbItems}</ol>
                        </nav>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div style="position: relative;">
                                <input 
                                    type="text" 
                                    id="s3SearchInput" 
                                    placeholder="Search files..."
                                    style="padding: 8px 12px 8px 36px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px; width: 200px;"
                                    onkeyup="debounceSearch(this.value, '${bucketName}', '${prefix}')"
                                />
                                <i class="bi bi-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
                            </div>
                            <button class="btn-custom btn-secondary" onclick="showCreateFolder('${bucketName}', '${prefix}')">
                                <i class="bi bi-folder-plus"></i>New Folder
                            </button>
                            <button class="btn-custom btn-primary" onclick="showS3Upload('${bucketName}', '${prefix}')">
                                <i class="bi bi-cloud-arrow-up"></i>Upload
                        </button>
                        </div>
                    </div>

                    <!-- Stats -->
                    <div class="s3-stats">
                        <span><i class="bi bi-folder"></i>${data.totalFolders || 0} folders</span>
                        <span><i class="bi bi-file-earmark"></i>${data.totalFiles || 0} files</span>
                    </div>

                    <!-- Files and Folders List -->
                    <div class="s3-items" id="s3ItemsContainer">
                        ${renderS3Items(bucketName, prefix, data)}
                    </div>
                    
                    <!-- Pagination Controls -->
                    <div style="padding: 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-primary);">
                        <button 
                            class="btn-custom btn-secondary" 
                            id="prevPageBtn"
                            style="visibility: hidden;"
                        >
                            <i class="bi bi-chevron-left"></i> Previous
                        </button>
                        <span id="pageInfo" style="color: var(--text-secondary); font-size: 14px;">Page 1</span>
                        <button 
                            class="btn-custom btn-secondary" 
                            id="nextPageBtn"
                            ${!data.isTruncated ? 'style="visibility: hidden;"' : ''}
                        >
                            Next <i class="bi bi-chevron-right"></i>
                        </button>
                    </div>
                </div>
            `;

            // Update modal body
            const modalBody = document.getElementById('customModalBody');
            if (modalBody) {
                modalBody.innerHTML = content;
            }

            // Initialize pagination state
            window._s3PaginationState = {
                bucketName: bucketName,
                prefix: prefix,
                currentPage: 1,
                pages: [{
                    data: data,
                    token: null
                }],
                nextToken: data.nextContinuationToken || null,
                hasMore: data.isTruncated || false
            };
            
            // Setup pagination button handlers
            const nextBtn = document.getElementById('nextPageBtn');
            const prevBtn = document.getElementById('prevPageBtn');
            
            if (nextBtn) {
                nextBtn.onclick = () => navigateS3Page('next');
            }
            if (prevBtn) {
                prevBtn.onclick = () => navigateS3Page('prev');
            }
            
            // Store current state for pagination
            window._s3BrowserState = {
                bucketName,
                prefix,
                nextToken: data.nextContinuationToken,
                hasMore: data.isTruncated
            };
        }

        function renderS3Items(bucketName, prefix, data) {
            let html = '';

            // Folders
            data.folders.forEach(folder => {
                const escapedKey = folder.key.replace(/'/g, "\\'");
                const escapedName = folder.name.replace(/'/g, "\\'");
                
                html += `
                    <div class="s3-item s3-folder" style="display: flex; align-items: center; gap: 12px; cursor: pointer; position: relative;">
                        <div style="flex: 1; display: flex; align-items: center; gap: 12px;" onclick="loadS3BrowserContent('${bucketName}', '${folder.key}')">
                            <div class="s3-item-icon">
                                <i class="bi bi-folder-fill"></i>
                            </div>
                            <div class="s3-item-info">
                        <div class="s3-item-name">${folder.name}</div>
                                <div class="s3-item-meta">Folder</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="s3-action-btn danger" onclick="event.stopPropagation(); deleteFolderConfirm('${bucketName}', '${escapedKey}', '${escapedName}')" title="Delete Folder">
                                <i class="bi bi-trash"></i>
                            </button>
                            <i class="bi bi-chevron-right text-muted" style="margin-left: 8px;"></i>
                        </div>
                    </div>
                `;
            });

            // Files
            data.files.forEach(file => {
                const escapedKey = file.key.replace(/'/g, "\\'");
                const escapedName = file.name.replace(/'/g, "\\'");
                const fileIcon = getFileIcon(file.name);
                
                html += `
                    <div class="s3-item">
                        <div class="s3-item-icon">
                            <i class="bi ${fileIcon}"></i>
                        </div>
                        <div class="s3-item-info">
                            <div class="s3-item-name">${file.name}</div>
                            <div class="s3-item-meta">${file.sizeFormatted}</div>
                        </div>
                        <div class="s3-item-actions">
                            <button class="s3-action-btn s3-action-icon" onclick="showFileInfo('${bucketName}', '${escapedKey}', '${escapedName}')" title="Info">
                                <i class="bi bi-info-circle"></i>
                            </button>
                            <button class="s3-action-btn s3-action-text" onclick="downloadS3File('${bucketName}', '${escapedKey}', '${escapedName}')" title="Download">
                                <i class="bi bi-download"></i>
                            </button>
                            <button class="s3-action-btn danger s3-action-icon" onclick="deleteS3File('${bucketName}', '${escapedKey}', '${escapedName}')" title="Delete">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            if (data.folders.length === 0 && data.files.length === 0) {
                html = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="bi bi-inbox"></i>
                        </div>
                        <p class="empty-text">This folder is empty</p>
                    </div>
                `;
            }

            return html;
        }

        function getFileIcon(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const icons = {
                'pdf': 'bi-file-earmark-pdf text-danger',
                'doc': 'bi-file-earmark-word text-primary', 'docx': 'bi-file-earmark-word text-primary',
                'xls': 'bi-file-earmark-excel text-success', 'xlsx': 'bi-file-earmark-excel text-success',
                'ppt': 'bi-file-earmark-ppt text-warning', 'pptx': 'bi-file-earmark-ppt text-warning',
                'jpg': 'bi-file-earmark-image text-info', 'jpeg': 'bi-file-earmark-image text-info', 
                'png': 'bi-file-earmark-image text-info', 'gif': 'bi-file-earmark-image text-info', 'webp': 'bi-file-earmark-image text-info',
                'mp4': 'bi-file-earmark-play text-purple', 'mov': 'bi-file-earmark-play text-purple', 'avi': 'bi-file-earmark-play text-purple',
                'mp3': 'bi-file-earmark-music text-pink', 'wav': 'bi-file-earmark-music text-pink',
                'zip': 'bi-file-earmark-zip text-secondary', 'rar': 'bi-file-earmark-zip text-secondary', '7z': 'bi-file-earmark-zip text-secondary',
                'js': 'bi-file-earmark-code text-warning', 'ts': 'bi-file-earmark-code text-primary', 
                'py': 'bi-file-earmark-code text-success', 'html': 'bi-file-earmark-code text-danger',
                'css': 'bi-file-earmark-code text-info', 'json': 'bi-file-earmark-code text-warning',
                'txt': 'bi-file-earmark-text text-muted', 'md': 'bi-file-earmark-text text-muted',
            };
            return icons[ext] || 'bi-file-earmark text-secondary';
        }

        function showS3Upload(bucketName, prefix) {
            const content = `
                <div class="upload-zone" id="uploadDropZone">
                    <i class="bi bi-cloud-arrow-up upload-icon"></i>
                    <div class="upload-text">Drag files here or click to browse</div>
                    <div class="upload-subtext">Max 50MB per file • Multiple files allowed</div>
                    <input type="file" id="s3FileInput" style="display: none;" multiple />
                </div>
                
                <div id="fileList" class="file-list">
                    <!-- Files will appear here -->
                </div>
                
                <div id="uploadProgress" class="progress-container" style="display: none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                    </div>
                    <p class="progress-text"><span id="progressText">Uploading...</span></p>
                </div>
                
                <div class="btn-group">
                    <button class="btn-custom btn-secondary" onclick="closeModal()">
                        Cancel
                    </button>
                    <button class="btn-custom btn-primary" id="uploadBtn" onclick="uploadS3FilesFromModal('${bucketName}', '${prefix}')" disabled>
                        <i class="bi bi-upload"></i>Upload Files
                    </button>
                </div>
            `;
            
            openModal(content, { title: `Upload to ${prefix || bucketName}`, size: 'medium' });
            
            // Setup drag & drop
            setTimeout(() => {
                const dropZone = document.getElementById('uploadDropZone');
                const fileInput = document.getElementById('s3FileInput');
                const uploadBtn = document.getElementById('uploadBtn');
                const fileList = document.getElementById('fileList');
                
                if (!dropZone) return;
                
                dropZone.onclick = () => fileInput.click();
                
                const updateFileList = () => {
                    const files = fileInput.files;
                    fileList.innerHTML = '';
                    
                    if (files.length > 0) {
                        let html = '';
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            html += `
                                <div class="file-item">
                                    <i class="bi bi-file-earmark file-icon"></i>
                                    <div class="file-info">
                                        <div class="file-name">${file.name}</div>
                                        <div class="file-size">${formatBytes(file.size)}</div>
                                    </div>
                                    <button type="button" class="file-remove" onclick="removeFile(${i})" title="Remove">
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                            `;
                        }
                        fileList.innerHTML = html;
                        dropZone.classList.add('active');
                        uploadBtn.disabled = false;
                    } else {
                        dropZone.classList.remove('active');
                        uploadBtn.disabled = true;
                    }
                };
                
                fileInput.onchange = updateFileList;
                
                dropZone.ondragover = (e) => {
                    e.preventDefault();
                    dropZone.classList.add('active');
                };
                
                dropZone.ondragleave = () => {
                    dropZone.classList.remove('active');
                };
                
                dropZone.ondrop = (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('active');
                    fileInput.files = e.dataTransfer.files;
                    updateFileList();
                };
            }, 100);
        }

        function removeFile(index) {
            const fileInput = document.getElementById('s3FileInput');
            const dt = new DataTransfer();
            for (let i = 0; i < fileInput.files.length; i++) {
                if (i !== index) {
                    dt.items.add(fileInput.files[i]);
                }
            }
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change'));
        }

        async function uploadS3FilesFromModal(bucketName, prefix) {
            const fileInput = document.getElementById('s3FileInput');
            const files = fileInput.files;

            if (!files.length) {
                showToast('❌ No files selected', 'error');
                return;
            }

            document.getElementById('uploadProgress').style.display = 'block';
            const uploadBtn = document.getElementById('uploadBtn');
            uploadBtn.disabled = true;
            const originalBtnText = uploadBtn.innerHTML;
            uploadBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>Uploading...';

            const userId = getUserId();
            let uploadedCount = 0;
            let failedCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                document.getElementById('progressText').textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}`;
                document.getElementById('progressFill').style.width = ((i / files.length) * 100) + '%';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('bucket', bucketName);
            formData.append('prefix', prefix);
            formData.append('userId', userId);
            formData.append('region', REGION);

            try {
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/s3/upload`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                        uploadedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (error) {
                    failedCount++;
                }
            }

            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('progressText').textContent = `✓ Done! ${uploadedCount} uploaded`;
            
            setTimeout(() => {
                if (failedCount > 0) {
                    showToast(`⚠️ ${uploadedCount} files uploaded, ${failedCount} failed`, 'warning');
                } else {
                    showToast(`✓ All ${uploadedCount} files uploaded successfully!`, 'success');
                }
                closeModal();
                    loadS3BrowserContent(bucketName, prefix);
            }, 500);
        }

        async function uploadS3FileFromModal(bucketName, prefix) {
            // Kept for backward compatibility
            uploadS3FilesFromModal(bucketName, prefix);
        }

        async function downloadS3File(bucketName, key, fileName) {
            // Show download options modal with expiry choices
            window._downloadParams = { bucketName, key, fileName };
            
            const content = `
                <div style="padding: 24px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-download" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                            Download Options
                        </h3>
                        <p style="font-size: 14px; color: var(--text-secondary); margin: 0; word-break: break-all;">
                            ${fileName || key.split('/').pop()}
                        </p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="font-size: 14px; font-weight: 500; color: var(--text-primary); display: block; margin-bottom: 8px;">
                            Link Expiry Time
                        </label>
                        <select 
                            id="expirySelect" 
                            style="width: 100%; padding: 10px 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px;"
                        >
                            <option value="900">15 minutes</option>
                            <option value="3600" selected>1 hour</option>
                            <option value="21600">6 hours</option>
                            <option value="86400">24 hours</option>
                            <option value="604800">7 days</option>
                        </select>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
                            The download link will expire after this duration
                        </div>
                    </div>
                    
                    <div style="display: grid; gap: 12px;">
                        <button class="btn-custom btn-primary" onclick="generateDownloadLink()" style="width: 100%;">
                            <i class="bi bi-link-45deg"></i> Generate & Copy Link
                        </button>
                        <button class="btn-custom btn-success" onclick="generateAndOpenDownloadLink()" style="width: 100%;">
                            <i class="bi bi-download"></i> Download Now
                        </button>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="width: 100%;">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Download File', size: 'small' });
        }

        async function generateDownloadLink() {
            const expirySelect = document.getElementById('expirySelect');
            const expiresIn = parseInt(expirySelect?.value || 3600);
            const { bucketName, key, fileName } = window._downloadParams;
            
            // Show loading
            event.target.disabled = true;
            event.target.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Generating...';
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/download?bucket=${encodeURIComponent(bucketName)}&key=${encodeURIComponent(key)}&userId=${userId}&region=${REGION}&expiresIn=${expiresIn}`
                );

                const data = await response.json();

                if (data.success) {
                    // Copy to clipboard
                    const tempInput = document.createElement('input');
                    tempInput.value = data.data.url;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                    
                    closeModal();
                    showToast('✓ Download link copied to clipboard!', 'success');
                } else {
                    const errorMsg = data.error || data.message || 'Failed to generate link';
                    showToast('❌ ' + errorMsg, 'error');
                    event.target.disabled = false;
                    event.target.innerHTML = '<i class="bi bi-link-45deg"></i> Generate & Copy Link';
                }
            } catch (error) {
                console.error('Download error:', error);
                showToast('❌ Network error', 'error');
                event.target.disabled = false;
                event.target.innerHTML = '<i class="bi bi-link-45deg"></i> Generate & Copy Link';
            }
        }

        async function generateAndOpenDownloadLink() {
            const expirySelect = document.getElementById('expirySelect');
            const expiresIn = parseInt(expirySelect?.value || 3600);
            const { bucketName, key, fileName } = window._downloadParams;
            
            // Show loading
            event.target.disabled = true;
            event.target.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Preparing...';
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/download?bucket=${encodeURIComponent(bucketName)}&key=${encodeURIComponent(key)}&userId=${userId}&region=${REGION}&expiresIn=${expiresIn}`
                );

                const data = await response.json();

                if (data.success) {
                    closeModal();
                    window.open(data.data.url, '_blank');
                    showToast('✓ Download started', 'success');
                } else {
                    const errorMsg = data.error || data.message || 'Download failed';
                    showToast('❌ ' + errorMsg, 'error');
                    event.target.disabled = false;
                    event.target.innerHTML = '<i class="bi bi-download"></i> Download Now';
                }
            } catch (error) {
                console.error('Download error:', error);
                showToast('❌ Network error', 'error');
                event.target.disabled = false;
                event.target.innerHTML = '<i class="bi bi-download"></i> Download Now';
            }
        }

        function showDownloadLinkModal(url, fileName, expiresIn = 3600) {
            const expiryTime = new Date(Date.now() + expiresIn * 1000).toLocaleTimeString();
            
            const content = `
                <div style="padding: 24px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-download" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                            Download Ready
                        </h3>
                        <p style="font-size: 14px; color: var(--text-secondary); margin: 0;">
                            ${fileName}
                        </p>
                    </div>
                    
                    <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <label style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 8px; font-weight: 500;">
                            Download URL (expires at ${expiryTime})
                        </label>
                        <div style="display: flex; gap: 8px;">
                            <input 
                                type="text" 
                                value="${url}" 
                                readonly 
                                id="downloadUrlInput"
                                style="flex: 1; font-size: 13px; padding: 10px 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace;"
                            />
                            <button 
                                class="btn-custom btn-secondary" 
                                onclick="copyDownloadUrl()"
                                style="padding: 10px 16px; white-space: nowrap;"
                            >
                                <i class="bi bi-clipboard"></i> Copy
                            </button>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="flex: 1;">
                            Close
                        </button>
                        <button class="btn-custom btn-primary" onclick="window.open('${url}', '_blank'); showToast('✓ Opening download...', 'success');" style="flex: 1;">
                            <i class="bi bi-box-arrow-up-right"></i> Open Link
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Download File', size: 'medium' });
        }

        function copyDownloadUrl() {
            const input = document.getElementById('downloadUrlInput');
            if (input) {
                input.select();
                document.execCommand('copy');
                showToast('✓ Download link copied!', 'success');
            }
        }

        async function showDetailedBucketStats(bucketName, bucketRegion) {
            // Show loading modal first
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading detailed statistics...</p>
                </div>
            `;
            openModal(loadingContent, { title: bucketName + ' - Statistics', size: 'large' });

            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/detailed-stats?bucket=${encodeURIComponent(bucketName)}&userId=${userId}&region=${bucketRegion}`
                );

                const data = await response.json();

                if (data.success) {
                    const stats = data.data;
                    // Update main dashboard S3 row (if visible) with these stats
                    try {
                        const rows = document.querySelectorAll('.s3-row[data-bucket-name]');
                        for (const row of rows) {
                            const attrName = (row.getAttribute('data-bucket-name') || '').replace(/&quot;/g, '"');
                            if (attrName === bucketName) {
                                const objectsSpan = row.querySelector('.s3-objects-count');
                                const sizeSpan = row.querySelector('.s3-size-text');
                                if (objectsSpan) objectsSpan.textContent = (stats.totalObjects || 0).toLocaleString();
                                if (sizeSpan) sizeSpan.textContent = stats.totalSizeFormatted || '—';
                                break;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to update dashboard S3 row after stats', e);
                    }
                    
                    const content = `
                        <div style="padding: 24px;">
                            <!-- Summary Cards -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;">
                                <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 12px; padding: 20px; color: white;">
                                    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Objects</div>
                                    <div style="font-size: 24px; font-weight: 700;">${stats.totalObjects.toLocaleString()}${stats.approximateCount ? '+' : ''}</div>
                                </div>
                                
                                <div style="background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 12px; padding: 20px; color: white;">
                                    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Size</div>
                                    <div style="font-size: 24px; font-weight: 700;">${stats.totalSizeFormatted}</div>
                                </div>
                                
                                <div style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); border-radius: 12px; padding: 20px; color: white;">
                                    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">File Types</div>
                                    <div style="font-size: 24px; font-weight: 700;">${stats.fileTypes.length}</div>
                                </div>
                            </div>
                            
                            ${stats.approximateCount ? '<div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 12px; color: var(--text-muted);"><i class="bi bi-info-circle"></i> Statistics limited to first 10,000 objects for performance</div>' : ''}
                            
                            <!-- File Type Breakdown -->
                            <div style="margin-bottom: 24px;">
                                <h4 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                    <i class="bi bi-pie-chart"></i> Storage by File Type
                                </h4>
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; overflow: hidden;">
                                    ${stats.fileTypes.slice(0, 10).map((type, typeIndex) => `
                                        <div style="display: flex; align-items: center; padding: 12px; border-bottom: ${typeIndex < 9 && typeIndex < stats.fileTypes.length - 1 ? '1px solid var(--border-primary)' : 'none'};">
                                            <div style="width: 60px; font-family: monospace; font-weight: 600; color: var(--aws-orange); font-size: 12px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 2em;" title=".${type.extension}">.${type.extension}</div>
                                            <div style="flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0;">
                                                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                                                    <div style="font-size: 13px; color: var(--text-primary); font-weight: 500;">${type.sizeFormatted}</div>
                                                    <div style="font-size: 11px; color: var(--text-muted);">${type.count} files</div>
                                                    <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${type.percentage}%</div>
                                                </div>
                                                <div style="width: 100%; height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden;">
                                                    <div style="height: 100%; background: linear-gradient(90deg, #4CAF50, #2196F3); border-radius: 3px; width: ${type.percentage}%; transition: width 0.4s ease;"></div>
                                                </div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <!-- Largest Files -->
                            <div>
                                <h4 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                    <i class="bi bi-file-earmark-text"></i> Largest Files (Top 10)
                                </h4>
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; overflow: hidden;">
                                    ${stats.largestFiles.map((file, fileIndex) => `
                                        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: ${fileIndex < stats.largestFiles.length - 1 ? '1px solid var(--border-primary)' : 'none'};">
                                            <div style="width: 30px; height: 30px; background: linear-gradient(135deg, #FF9800, #F57C00); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: white; font-size: 12px; flex-shrink: 0;">
                                                ${fileIndex + 1}
                                            </div>
                                            <div style="flex: 1; min-width: 0; overflow: hidden;">
                                                <div style="font-size: 13px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${file.name}</div>
                                                <div style="font-size: 11px; color: var(--text-muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.key}</div>
                                            </div>
                                            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); white-space: nowrap;">${file.sizeFormatted}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div style="margin-top: 20px; display: flex; gap: 12px;">
                                <button class="btn-custom btn-secondary" onclick="closeModal()" style="flex: 1;">
                                    Close
                                </button>
                                <button class="btn-custom btn-primary" onclick="browseS3Bucket('${bucketName}'); closeModal();" style="flex: 1;">
                                    <i class="bi bi-folder-open"></i> Browse Files
                                </button>
                            </div>
                        </div>
                    `;
                    
                    // Update modal content
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = content;
                    }
                } else {
                    closeModal();
                    showToast('❌ Could not load statistics: ' + (data.error || data.message), 'error');
                }
            } catch (error) {
                console.error('Bucket stats error:', error);
                closeModal();
                showToast('❌ Network error', 'error');
            }
        }

        async function showBucketInfo(bucketName, bucketRegion) {
            // Show loading modal first
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading bucket information...</p>
                </div>
            `;
            openModal(loadingContent, { title: bucketName, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/info?bucket=${encodeURIComponent(bucketName)}&userId=${userId}&region=${bucketRegion}`
                );

                const data = await response.json();

                if (data.success) {
                    const info = data.data;
                    const content = `
                        <div style="padding: 24px;">
                            <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
                                <div style="flex: 1; min-width: 200px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #FF9900 0%, #FF6600 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <i class="bi bi-diagram-3" style="font-size: 20px; color: white;"></i>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Region</div>
                                            <div style="font-size: 16px; color: var(--text-primary); font-weight: 600;">${info.region}</div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="flex: 1; min-width: 200px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <i class="bi bi-files" style="font-size: 20px; color: white;"></i>
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Total Objects</div>
                                            <div style="font-size: 16px; color: var(--text-primary); font-weight: 600;">
                                                ${info.totalObjects.toLocaleString()}${info.approximateCount ? '+' : ''}
                                            </div>
                                            ${info.approximateCount ? '<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">⚠️ Limited to 10k</div>' : ''}
                                        </div>
                                    </div>
                                </div>
                                
                                <div style="flex: 1; min-width: 200px; background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 20px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <i class="bi bi-hdd" style="font-size: 20px; color: white;"></i>
                                        </div>
                                        <div>
                                            <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Total Size</div>
                                            <div style="font-size: 16px; color: var(--text-primary); font-weight: 600;">${info.totalSizeFormatted}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 12px;">
                                <button class="btn-custom btn-secondary" onclick="closeModal()" style="flex: 1;">
                                    Close
                                </button>
                                <button class="btn-custom btn-primary" onclick="browseS3Bucket('${bucketName}'); closeModal();" style="flex: 1;">
                                    <i class="bi bi-folder-open"></i> Browse Files
                                </button>
                            </div>
                        </div>
                    `;
                    
                    // Update modal content
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = content;
                    }
                } else {
                    closeModal();
                    showToast('❌ Could not load bucket info: ' + (data.error || data.message), 'error');
                }
            } catch (error) {
                console.error('Bucket info error:', error);
                closeModal();
                showToast('❌ Network error', 'error');
            }
        }

        async function deleteBucket(bucketName, bucketRegion) {
            window._deleteBucketParams = { bucketName, bucketRegion };
            
            const content = `
                <div class="delete-modal-content">
                    <div class="delete-icon-wrapper">
                        <i class="bi bi-trash delete-icon"></i>
                    </div>
                    <h5 class="delete-title">Delete Bucket?</h5>
                    <p class="delete-description">You're about to permanently delete this S3 bucket. The bucket must be empty before it can be deleted.</p>
                    <div class="delete-filename">
                        <code>${bucketName}</code>
                    </div>
                    <div class="delete-warning">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <span>This action is irreversible</span>
                    </div>
                </div>
                
                <div class="btn-group">
                    <button class="btn-custom btn-secondary" onclick="closeModal()">
                        Cancel
                    </button>
                    <button class="btn-custom btn-danger" onclick="confirmDeleteBucket()">
                        <i class="bi bi-trash"></i>Delete Bucket
                    </button>
                </div>
            `;
            
            openModal(content, { title: 'Confirm Deletion', size: 'small' });
        }

        async function confirmDeleteBucket() {
            const { bucketName, bucketRegion } = window._deleteBucketParams;
            
            // Update button to show loading
            const deleteBtn = document.querySelector('.btn-danger');
            if (deleteBtn) {
                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Deleting...';
                deleteBtn.disabled = true;
            }
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/delete-bucket`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            bucket: bucketName,
                            userId: userId,
                            region: bucketRegion
                        })
                    }
                );

                const data = await response.json();

                if (data.success) {
                    closeModal();
                    showToast('✓ Bucket deleted successfully', 'success');
                    // Refresh dashboard to update bucket list
                    loadDashboard();
                } else {
                    const errorMsg = data.error || data.message || 'Delete failed';
                    const errorCode = data.errorCode || data.code;
                    
                    // Show error in modal instead of just closing
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-exclamation-triangle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Failed to Delete Bucket</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">${errorMsg}</p>
                            ${errorCode === 'BUCKET_NOT_EMPTY' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⚠️ The bucket must be empty before deletion. Please delete all objects first.</p>' : ''}
                            ${errorCode === 'ACCESS_DENIED' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⛔ You don\'t have permission to delete this bucket.</p>' : ''}
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = errorContent;
                    }
                }
            } catch (error) {
                console.error('Delete bucket error:', error);
                
                // Show network error in modal
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-wifi-off" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Network Error</h4>
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Could not connect to the server. Please try again.</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                
                const modalBody = document.getElementById('customModalBody');
                if (modalBody) {
                    modalBody.innerHTML = errorContent;
                }
            }
        }

        // Search functionality with debouncing
        let searchTimeout;
        function debounceSearch(searchTerm, bucketName, prefix) {
            clearTimeout(searchTimeout);
            
            if (!searchTerm || searchTerm.trim().length === 0) {
                // If search cleared, reload normal view
                loadS3BrowserContent(bucketName, prefix);
                return;
            }
            
            searchTimeout = setTimeout(() => {
                searchS3Files(searchTerm.trim(), bucketName, prefix);
            }, 300);
        }

        async function searchS3Files(searchTerm, bucketName, prefix) {
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/search?bucket=${encodeURIComponent(bucketName)}&searchTerm=${encodeURIComponent(searchTerm)}&userId=${userId}&region=${REGION}&maxResults=100`
                );

                const data = await response.json();

                if (data.success) {
                    const matches = data.data?.matches || [];
                    renderSearchResults(bucketName, prefix, searchTerm, matches);
                } else {
                    showToast('❌ Search failed: ' + (data.error || data.message), 'error');
                }
            } catch (error) {
                console.error('Search error:', error);
                showToast('❌ Network error during search', 'error');
            }
        }

        function renderSearchResults(bucketName, prefix, searchTerm, results) {
            // Get the S3 browser container and update it
            const s3Browser = document.querySelector('.s3-browser');
            if (!s3Browser) return;

            // Update breadcrumb to show we're in search mode
            const breadcrumb = s3Browser.querySelector('.s3-breadcrumb ol');
            if (breadcrumb) {
                breadcrumb.innerHTML = `
                    <li class="breadcrumb-item">
                        <a href="#" class="breadcrumb-link" onclick="loadS3BrowserContent('${bucketName}', '${prefix}'); return false;">
                            <i class="bi bi-arrow-left"></i> Back to Browse
                        </a>
                    </li>
                    <li class="breadcrumb-item breadcrumb-current">Search: "${searchTerm}"</li>
                `;
            }

            // Update stats to show search results count
            const stats = s3Browser.querySelector('.s3-stats');
            const count = Array.isArray(results) ? results.length : 0;
            if (stats) {
                stats.innerHTML = `<span><i class="bi bi-search"></i> ${count} result${count !== 1 ? 's' : ''} found</span>`;
            }

            // Update items container with search results
            const itemsContainer = s3Browser.querySelector('.s3-items');
            if (itemsContainer) {
                itemsContainer.innerHTML = renderSearchItems(bucketName, results);
                // reset page counters for search result
                itemsContainer.dataset.pagesLoaded = '1';
                itemsContainer.dataset.maxPages = '5';
            }
        }

        function renderSearchItems(bucketName, results) {
            results = Array.isArray(results) ? results : [];
            if (results.length === 0) {
                return `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="bi bi-search"></i></div>
                        <div class="empty-title">No Results Found</div>
                        <div class="empty-text">Try a different search term</div>
                    </div>
                `;
            }

            let html = '';
            results.forEach(file => {
                const escapedKey = file.key.replace(/'/g, "\\'");
                const escapedName = file.name.replace(/'/g, "\\'");
                const fileIcon = getFileIcon(file.name);
                
                // Extract folder path for display
                const pathParts = file.key.split('/');
                pathParts.pop(); // Remove filename
                const folderPath = pathParts.length > 0 ? pathParts.join('/') + '/' : '';
                
                html += `
                    <div class="s3-item">
                        <div class="s3-item-icon">
                            <i class="bi ${fileIcon}"></i>
                        </div>
                        <div class="s3-item-info">
                            <div class="s3-item-name">${file.name}</div>
                            <div class="s3-item-meta">
                                ${file.sizeFormatted}
                                ${folderPath ? ' • <span style="font-family: monospace; font-size: 11px;">/' + folderPath + '</span>' : ''}
                            </div>
                        </div>
                        <div class="s3-item-actions">
                            <button class="s3-action-btn" onclick="showFileInfo('${bucketName}', '${escapedKey}', '${escapedName}')" title="Info">
                                <i class="bi bi-info-circle"></i>
                            </button>
                            <button class="s3-action-btn" onclick="downloadS3File('${bucketName}', '${escapedKey}', '${escapedName}')" title="Download">
                                <i class="bi bi-download"></i>
                            </button>
                            <button class="s3-action-btn danger" onclick="deleteS3File('${bucketName}', '${escapedKey}', '${escapedName}')" title="Delete">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            return html;
        }

        async function navigateS3Page(direction) {
            const state = window._s3PaginationState;
            if (!state) return;
            
            const nextBtn = document.getElementById('nextPageBtn');
            const prevBtn = document.getElementById('prevPageBtn');
            const pageInfo = document.getElementById('pageInfo');
            const container = document.getElementById('s3ItemsContainer');
            
            if (direction === 'next') {
                const nextPage = state.currentPage + 1;
                
                // Check if we already have this page cached
                if (state.pages[nextPage - 1]) {
                    // Use cached page
                    state.currentPage = nextPage;
                    container.innerHTML = renderS3Items(state.bucketName, state.prefix, state.pages[nextPage - 1].data);
                } else if (state.hasMore && state.nextToken) {
                    // Fetch next page
                    if (nextBtn) {
                        nextBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Loading...';
                        nextBtn.disabled = true;
                    }
                    
                    try {
                        const userId = getUserId();
                        const url = `${API_BASE}/server/aws_handler/widget/s3/browse?bucket=${encodeURIComponent(state.bucketName)}&prefix=${encodeURIComponent(state.prefix)}&userId=${userId}&region=${REGION}&maxKeys=5&continuationToken=${encodeURIComponent(state.nextToken)}`;
                        
                        const response = await fetch(url);
                        const data = await response.json();

                        if (data.success) {
                            // Cache this page
                            state.pages.push({
                                data: data.data,
                                token: state.nextToken
                            });
                            state.currentPage = nextPage;
                            state.nextToken = data.data.nextContinuationToken || null;
                            state.hasMore = data.data.isTruncated || false;
                            
                            // Replace container content
                            container.innerHTML = renderS3Items(state.bucketName, state.prefix, data.data);
                        } else {
                            throw new Error(data.error || 'Failed to load page');
                        }
                    } catch (error) {
                        console.error('Navigate error:', error);
                        showToast('❌ Failed to load page', 'error');
                        if (nextBtn) {
                            nextBtn.innerHTML = 'Next <i class="bi bi-chevron-right"></i>';
                            nextBtn.disabled = false;
                        }
                        return;
                    }
                }
            } else if (direction === 'prev') {
                if (state.currentPage > 1) {
                    state.currentPage--;
                    container.innerHTML = renderS3Items(state.bucketName, state.prefix, state.pages[state.currentPage - 1].data);
                }
            }
            
            // Update UI
            if (pageInfo) {
                pageInfo.textContent = `Page ${state.currentPage}`;
            }
            if (prevBtn) {
                prevBtn.style.visibility = state.currentPage > 1 ? 'visible' : 'hidden';
            }
            if (nextBtn) {
                nextBtn.innerHTML = 'Next <i class="bi bi-chevron-right"></i>';
                nextBtn.disabled = false;
                nextBtn.style.visibility = (state.hasMore || state.currentPage < state.pages.length) ? 'visible' : 'hidden';
            }
        }

        async function showFileInfo(bucketName, key, fileName) {
            // Show loading modal first
            const loadingContent = `
                <div style="text-align: center; padding: 40px;">
                    <div class="spinner-border" role="status" style="width: 48px; height: 48px; color: var(--aws-orange); border-width: 4px;">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p style="margin-top: 20px; color: var(--text-secondary);">Loading file information...</p>
                </div>
            `;
            openModal(loadingContent, { title: fileName, size: 'medium' });
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/object-info?bucket=${encodeURIComponent(bucketName)}&key=${encodeURIComponent(key)}&userId=${userId}&region=${REGION}`
                );

                const data = await response.json();

                if (data.success) {
                    const info = data.data;
                    const lastModified = new Date(info.lastModified).toLocaleString();
                    const hasMetadata = Object.keys(info.metadata).length > 0;
                    
                    const content = `
                        <div style="padding: 24px;">
                            <!-- File Icon and Name -->
                            <div style="text-align: center; margin-bottom: 24px;">
                                <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                    <i class="bi bi-file-earmark-text" style="font-size: 32px; color: white;"></i>
                                </div>
                                <h4 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; word-break: break-all;">
                                    ${fileName}
                                </h4>
                            </div>
                            
                            <!-- File Properties Grid - HORIZONTAL LAYOUT -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px;">
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 6px;">Size</div>
                                    <div style="font-size: 15px; color: var(--text-primary); font-weight: 600;">${info.sizeFormatted}</div>
                                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${info.size.toLocaleString()} bytes</div>
                                </div>
                                
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 6px;">Content Type</div>
                                    <div style="font-size: 13px; color: var(--text-primary); font-family: monospace;">${info.contentType || 'application/octet-stream'}</div>
                                </div>
                                
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 6px;">Last Modified</div>
                                    <div style="font-size: 13px; color: var(--text-primary);">${lastModified}</div>
                                </div>
                                
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 6px;">Storage Class</div>
                                    <div style="font-size: 14px; color: var(--text-primary);">${info.storageClass}</div>
                                </div>
                                
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; grid-column: span 2;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 6px;">ETag</div>
                                    <div style="font-size: 12px; color: var(--text-primary); font-family: monospace; word-break: break-all;">${info.etag}</div>
                                </div>
                            </div>
                            
                            ${hasMetadata ? `
                                <div style="background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                                    <div style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-bottom: 8px;">Custom Metadata</div>
                                    <div style="font-size: 13px; color: var(--text-primary);">
                                        ${Object.entries(info.metadata).map(([k, v]) => `
                                            <div style="display: flex; margin-bottom: 4px;">
                                                <span style="font-weight: 600; margin-right: 8px;">${k}:</span>
                                                <span style="font-family: monospace;">${v}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="width: 100%;">
                                Close
                            </button>
                        </div>
                    `;
                    
                    // Update modal content
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = content;
                    }
                } else {
                    // Show error in modal instead of closing immediately
                    const errorMsg = data.error || data.message || 'Failed to load file information';
                    const errorCode = data.errorCode || data.code;
                    
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-exclamation-triangle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Failed to Load File Info</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">${errorMsg}</p>
                            ${errorCode === 'ACCESS_DENIED' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⛔ You don\'t have permission to access this file</p>' : ''}
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = errorContent;
                    }
                }
            } catch (error) {
                console.error('File info error:', error);
                
                // Show network error in modal
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-wifi-off" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Network Error</h4>
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Could not connect to the server. Please check your connection and try again.</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                
                const modalBody = document.getElementById('customModalBody');
                if (modalBody) {
                    modalBody.innerHTML = errorContent;
                }
            }
        }

        function showCreateFolder(bucketName, prefix) {
            const content = `
                <div style="padding: 24px;">
                    <div style="margin-bottom: 20px;">
                        <label style="font-size: 14px; font-weight: 500; color: var(--text-primary); display: block; margin-bottom: 8px;">
                            Folder Name
                        </label>
                        <input 
                            type="text" 
                            id="folderNameInput" 
                            placeholder="Enter folder name"
                            style="width: 100%; padding: 10px 12px; border: 1px solid var(--border-primary); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px;"
                            onkeypress="if(event.key==='Enter') createFolder('${bucketName}', '${prefix}')"
                        />
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
                            Valid characters: letters, numbers, hyphens, underscores
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="flex: 1;">
                            Cancel
                        </button>
                        <button class="btn-custom btn-primary" onclick="createFolder('${bucketName}', '${prefix}')" style="flex: 1;">
                            <i class="bi bi-folder-plus"></i> Create Folder
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Create New Folder', size: 'small' });
            
            // Focus input after modal opens
            setTimeout(() => {
                const input = document.getElementById('folderNameInput');
                if (input) input.focus();
            }, 100);
        }

        async function createFolder(bucketName, prefix) {
            const input = document.getElementById('folderNameInput');
            const folderName = input?.value.trim();
            
            if (!folderName) {
                showToast('❌ Please enter a folder name', 'error');
                return;
            }
            
            // Validate folder name
            const validPattern = /^[a-zA-Z0-9_-]+$/;
            if (!validPattern.test(folderName)) {
                showToast('❌ Invalid folder name. Use only letters, numbers, hyphens, and underscores.', 'error');
                return;
            }
            
            // Disable create button and show loading
            const createBtn = event.target;
            if (createBtn) {
                createBtn.disabled = true;
                createBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Creating...';
            }
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/create-folder`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            bucket: bucketName,
                            folderName: folderName,
                            prefix: prefix || '',
                            userId: userId,
                            region: REGION
                        })
                    }
                );

                const data = await response.json();

                if (data.success) {
                    // Show success message in modal before closing
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-check-circle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Folder Created!</h4>
                            <p style="font-size: 14px; color: var(--text-secondary);">Refreshing browser...</p>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = successContent;
                    }
                    
                    // Wait a bit then refresh and close
                    setTimeout(() => {
                        closeModal();
                        loadS3BrowserContent(bucketName, prefix);
                        showToast('✓ Folder created successfully', 'success');
                    }, 800);
                } else {
                    const errorMsg = data.error || data.message || 'Failed to create folder';
                    const errorCode = data.errorCode || data.code;
                    
                    // Show error in modal
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-exclamation-triangle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Failed to Create Folder</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">${errorMsg}</p>
                            ${errorCode === 'ACCESS_DENIED' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⛔ You don\'t have permission to create folders in this bucket</p>' : ''}
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = errorContent;
                    }
                }
            } catch (error) {
                console.error('Create folder error:', error);
                
                // Show network error in modal
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-wifi-off" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Network Error</h4>
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Could not connect to the server. Please try again.</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                
                const modalBody = document.getElementById('customModalBody');
                if (modalBody) {
                    modalBody.innerHTML = errorContent;
                }
            }
        }

        function deleteFolderConfirm(bucketName, folderKey, folderName) {
            window._deleteFolderParams = { bucketName, folderKey };
            
            const content = `
                <div class="delete-modal-content">
                    <div class="delete-icon-wrapper">
                        <i class="bi bi-folder-x delete-icon" style="color: var(--aws-orange);"></i>
                    </div>
                    <h5 class="delete-title">Delete Folder?</h5>
                    <p class="delete-description">You're about to permanently delete this folder and ALL its contents. This action cannot be undone.</p>
                    <div class="delete-filename">
                        <code>${folderName}/</code>
                    </div>
                    <div class="delete-warning">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <span>All files and subfolders will be deleted recursively</span>
                    </div>
                </div>
                
                <div class="btn-group">
                    <button class="btn-custom btn-secondary" onclick="closeModal()">
                        Cancel
                    </button>
                    <button class="btn-custom btn-danger" onclick="confirmDeleteFolder()">
                        <i class="bi bi-trash"></i>Delete Folder
                    </button>
                </div>
            `;
            
            openModal(content, { title: 'Confirm Deletion', size: 'small' });
        }

        async function confirmDeleteFolder() {
            const { bucketName, folderKey } = window._deleteFolderParams;
            
            // Update button to show loading
            const deleteBtn = document.querySelector('.btn-danger');
            if (deleteBtn) {
                deleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Deleting...';
                deleteBtn.disabled = true;
            }
            
            try {
                const userId = getUserId();
                const response = await fetch(
                    `${API_BASE}/server/aws_handler/widget/s3/delete-folder`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            bucket: bucketName,
                            folderKey: folderKey,
                            userId: userId,
                            region: REGION
                        })
                    }
                );

                const data = await response.json();

                if (data.success) {
                    // Show success message before navigating
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-check-circle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Folder Deleted!</h4>
                            <p style="font-size: 14px; color: var(--text-secondary);">${data.data.objectsDeleted} objects removed</p>
                            <p style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">Navigating to parent folder...</p>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = successContent;
                    }
                    
                    // Wait then navigate
                    setTimeout(() => {
                        closeModal();
                        const parentPrefix = folderKey.split('/').slice(0, -2).join('/') + (folderKey.split('/').length > 2 ? '/' : '');
                        loadS3BrowserContent(bucketName, parentPrefix);
                        showToast(`✓ Folder deleted (${data.data.objectsDeleted} objects removed)`, 'success');
                    }, 1000);
                } else {
                    const errorMsg = data.error || data.message || 'Failed to delete folder';
                    const errorCode = data.errorCode || data.code;
                    
                    // Show error in modal
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-exclamation-triangle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Failed to Delete Folder</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">${errorMsg}</p>
                            ${errorCode === 'ACCESS_DENIED' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⛔ You don\'t have permission to delete this folder</p>' : ''}
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = errorContent;
                    }
                }
            } catch (error) {
                console.error('Delete folder error:', error);
                
                // Show network error in modal
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-wifi-off" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Network Error</h4>
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Could not connect to the server. Please try again.</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                
                const modalBody = document.getElementById('customModalBody');
                if (modalBody) {
                    modalBody.innerHTML = errorContent;
                }
            }
        }

        function deleteS3File(bucketName, key, fileName) {
            window._deleteParams = { bucketName, key };
            
            const content = `
                <div class="delete-modal-content">
                    <div class="delete-icon-wrapper">
                        <i class="bi bi-trash delete-icon"></i>
                    </div>
                    <h5 class="delete-title">Delete File?</h5>
                    <p class="delete-description">You're about to permanently delete this file. This action cannot be undone.</p>
                    <div class="delete-filename">
                        <code>${fileName}</code>
                    </div>
                    <div class="delete-warning">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <span>This action is irreversible</span>
                    </div>
                    <div class="btn-group" style="justify-content: center;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()">
                            Cancel
                        </button>
                        <button class="btn-custom btn-danger" onclick="confirmDeleteS3File()">
                            <i class="bi bi-trash"></i>Delete Permanently
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Confirm Deletion', size: 'small' });
        }

        async function confirmDeleteS3File() {
            const { bucketName, key } = window._deleteParams;
                    const currentPrefix = key.substring(0, key.lastIndexOf('/') + 1);
            
            // Find and disable delete button
            const deleteBtn = document.querySelector('.btn-danger');
            if (deleteBtn) {
                deleteBtn.disabled = true;
                const originalHTML = deleteBtn.innerHTML;
                deleteBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i>Deleting...';
            }

            try {
                const userId = getUserId();
                
                const response = await fetch(API_BASE + '/server/aws_handler/widget/s3/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bucket: bucketName, key, userId, region: REGION })
                });

                const data = await response.json();

                if (data.success) {
                    // Show success before closing
                    const successContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-check-circle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">File Deleted!</h4>
                            <p style="font-size: 14px; color: var(--text-secondary);">Refreshing browser...</p>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = successContent;
                    }
                    
                    // Wait then refresh
                    setTimeout(async () => {
                        closeModal();
                        await loadS3BrowserContent(bucketName, currentPrefix);
                        showToast('✓ File deleted successfully', 'success');
                    }, 800);
                } else {
                    // Show proper error message in modal
                    const errorMsg = data.error || data.message || 'Delete failed';
                    const errorCode = data.errorCode || data.code;
                    
                    const errorContent = `
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <i class="bi bi-exclamation-triangle" style="font-size: 32px; color: white;"></i>
                            </div>
                            <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Failed to Delete File</h4>
                            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">${errorMsg}</p>
                            ${errorCode === 'ACCESS_DENIED' ? '<p style="font-size: 13px; color: var(--aws-orange); margin-bottom: 20px;">⛔ You don\'t have permission to delete this file</p>' : ''}
                            <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                        </div>
                    `;
                    
                    const modalBody = document.getElementById('customModalBody');
                    if (modalBody) {
                        modalBody.innerHTML = errorContent;
                    }
                }
            } catch (error) {
                console.error('Delete error:', error);
                
                // Show network error in modal
                const errorContent = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 64px; height: 64px; margin: 0 auto 16px; background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="bi bi-wifi-off" style="font-size: 32px; color: white;"></i>
                        </div>
                        <h4 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px;">Network Error</h4>
                        <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Could not connect to the server. Please try again.</p>
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="margin-top: 20px;">Close</button>
                    </div>
                `;
                
                const modalBody = document.getElementById('customModalBody');
                if (modalBody) {
                    modalBody.innerHTML = errorContent;
                }
            }
        }

        // Make S3 functions globally accessible
        window.browseS3Bucket = browseS3Bucket;
        window.loadS3BrowserContent = loadS3BrowserContent;
        window.navigateS3Page = navigateS3Page;
        window.showS3Upload = showS3Upload;
        window.uploadS3FileFromModal = uploadS3FileFromModal;
        window.confirmDeleteS3File = confirmDeleteS3File;
        window.downloadS3File = downloadS3File;
        window.deleteS3File = deleteS3File;

        // ====================================================================
        // S3 PAGINATION
        // ====================================================================
        
        let s3CurrentPage = 1;
        const s3ItemsPerPage = 5;
        let s3AllBuckets = [];

        function initializeS3Pagination() {
            const s3Rows = document.querySelectorAll('.s3-row');
            s3AllBuckets = Array.from(s3Rows);
            
            if (s3AllBuckets.length > s3ItemsPerPage) {
                renderS3Page(1);
            }
        }

        function renderS3Page(page) {
            s3CurrentPage = page;
            const start = (page - 1) * s3ItemsPerPage;
            const end = start + s3ItemsPerPage;
            const totalPages = Math.ceil(s3AllBuckets.length / s3ItemsPerPage);

            // Hide all buckets
            s3AllBuckets.forEach(bucket => bucket.style.display = 'none');

            // Show only current page buckets
            s3AllBuckets.slice(start, end).forEach(bucket => bucket.style.display = 'flex');

            // Update pagination controls
            const pageInfo = document.getElementById('s3-page-info');
            const prevBtn = document.getElementById('s3-prev-btn');
            const nextBtn = document.getElementById('s3-next-btn');

            if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages}`;
            if (prevBtn) prevBtn.disabled = page === 1;
            if (nextBtn) nextBtn.disabled = page === totalPages;
        }

        function changeS3Page(direction) {
            const totalPages = Math.ceil(s3AllBuckets.length / s3ItemsPerPage);
            const newPage = s3CurrentPage + direction;
            
            if (newPage >= 1 && newPage <= totalPages) {
                renderS3Page(newPage);
            }
        }

        window.changeS3Page = changeS3Page;

        // ====================================================================
        // CREATE S3 BUCKET
        // ====================================================================

        function showCreateBucketModal() {
            const content = `
                <div style="padding: 20px;">
                    <h5 style="margin-bottom: 20px; color: var(--text-primary);">Create New S3 Bucket</h5>
                    
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">Bucket Name <span style="color: var(--danger);">*</span></label>
                        <input type="text" id="newBucketName" placeholder="my-unique-bucket-name" 
                            style="width: 100%; padding: 10px 12px; border: 1px solid var(--border-primary); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px;">
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
                            • Must be globally unique across all AWS accounts<br>
                            • Only lowercase letters, numbers, hyphens, and dots<br>
                            • Must be between 3-63 characters
                        </div>
                    </div>

                    <div style="background: rgba(33, 150, 243, 0.1); border: 1px solid rgba(33, 150, 243, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: start; gap: 10px;">
                            <i class="bi bi-info-circle" style="color: #2196F3; font-size: 16px; margin-top: 2px;"></i>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                <strong style="color: var(--text-primary);">Note:</strong> The bucket will be created in <strong>${REGION}</strong> region with default settings (private access, no versioning).
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px;">
                        <button class="btn-custom btn-secondary" onclick="closeModal()" style="flex: 1;">Cancel</button>
                        <button class="btn-custom btn-primary" onclick="confirmCreateBucket()" style="flex: 1;">
                            <i class="bi bi-plus-circle"></i> Create Bucket
                        </button>
                    </div>
                </div>
            `;
            
            openModal(content, { title: 'Create S3 Bucket', size: 'medium' });
        }

        async function confirmCreateBucket() {
            const input = document.getElementById('newBucketName');
            const bucketName = input?.value.trim();
            const region = REGION; // Use current region

            // Reset input styling
            if (input) {
                input.style.borderColor = 'var(--border-primary)';
            }

            if (!bucketName) {
                if (input) input.style.borderColor = '#FF5252';
                showToast('⚠️ Please enter a bucket name', 'warning');
                return;
            }

            // Validate bucket name
            const bucketNameRegex = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
            if (!bucketNameRegex.test(bucketName) || bucketName.length < 3 || bucketName.length > 63) {
                if (input) input.style.borderColor = '#FF5252';
                showToast('⚠️ Invalid bucket name format', 'warning');
                return;
            }

            const btn = event.target.closest('button');
            const originalBtnHtml = btn?.innerHTML;
            
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<div class="spinner-border" role="status" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; margin-right: 8px;"></div> Creating...';
            }

            // Show loading toast
            showToast('⏳ Creating bucket...', 'info');

            try {
                const userId = getUserId();
                const response = await fetch(`${API_BASE}/server/aws_handler/widget/s3/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bucketName, region, userId })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    closeModal();
                    showToast('✅ Bucket "' + bucketName + '" created successfully!', 'success');
                    setTimeout(() => location.reload(), 1500);
                } else {
                    // Show specific error message from server
                    const errorMsg = data.error || data.message || 'Failed to create bucket';
                    if (input) input.style.borderColor = '#FF5252';
                    
                    // Handle bucket already exists error with longer display time
                    const errCode = data.code || data.errorCode;
                    const isBucketExists = errCode === 'BUCKET_EXISTS' || response.status === 409;

                    if (isBucketExists) {
                        showToast('⚠️ Bucket name "' + bucketName + '" already exists. Please choose a different name.', 'warning', 5000);
                    } else {
                        showToast('❌ ' + errorMsg, 'error');
                    }
                    
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalBtnHtml;
                    }
                }
            } catch (error) {
                console.error('Create bucket error:', error);
                if (input) input.style.borderColor = '#FF5252';
                showToast('❌ Network error: ' + error.message, 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalBtnHtml;
                }
            }
        }

        window.showCreateBucketModal = showCreateBucketModal;
        window.confirmCreateBucket = confirmCreateBucket;

        window.showBucketInfo = showBucketInfo;
        window.deleteBucket = deleteBucket;
        window.confirmDeleteBucket = confirmDeleteBucket;
        window.showDownloadLinkModal = showDownloadLinkModal;
        window.copyDownloadUrl = copyDownloadUrl;
        window.debounceSearch = debounceSearch;
        window.searchS3Files = searchS3Files;
        window.navigateS3Page = navigateS3Page;
        window.showFileInfo = showFileInfo;
        window.showCreateFolder = showCreateFolder;
        window.createFolder = createFolder;
        window.deleteFolderConfirm = deleteFolderConfirm;
        window.confirmDeleteFolder = confirmDeleteFolder;
        window.generateDownloadLink = generateDownloadLink;
        window.generateAndOpenDownloadLink = generateAndOpenDownloadLink;
        window.showDetailedBucketStats = showDetailedBucketStats;

        // Start loading data immediately
        loadDashboard();
