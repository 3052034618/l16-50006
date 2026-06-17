let products = [];
let orders = [];
let currentOrder = null;
let selectedQuantities = {};
let refunds = [];
let paymentRecords = [];
let currentRefundFilter = '';

const statusMap = {
  'PENDING_PAYMENT': '待付款',
  'PENDING_SHIPMENT': '待发货',
  'SHIPPED': '已发货',
  'COMPLETED': '已完成',
  'CLOSED': '已关闭',
  'REFUNDING': '退款中',
  'REFUNDED': '已退款'
};

const paymentStatusMap = {
  'UNPAID': '未支付',
  'PAID': '已支付',
  'REFUNDING': '退款中',
  'REFUNDED': '已退款',
  'FAILED': '支付失败'
};

const refundStatusMap = {
  'PENDING': '待处理',
  'APPROVED': '已同意',
  'REJECTED': '已拒绝',
  'PROCESSING': '退款中',
  'COMPLETED': '已完成',
  'FAILED': '失败'
};

const eventTypeMap = {
  'CREATED': '创建订单',
  'PAYMENT_SUCCESS': '支付成功',
  'PAYMENT_FAILED': '支付失败',
  'SHIPPED': '已发货',
  'COMPLETED': '确认收货',
  'CANCELLED': '取消订单',
  'AUTO_CLOSED': '超时关闭',
  'REFUND_APPLIED': '申请退款',
  'REFUND_APPROVED': '退款审批',
  'REFUND_REJECTED': '退款拒绝',
  'REFUND_COMPLETED': '退款完成',
  'STOCK_RESERVED': '库存预占',
  'STOCK_RELEASED': '库存释放',
  'STOCK_CONFIRMED': '库存确认',
};

const reservationStatusMap = {
  'ACTIVE': '预占中',
  'CONFIRMED': '已确认',
  'RELEASED': '已释放',
};

function init() {
  loadProducts();
  setupTabs();
  refreshOrders();
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(tabId).classList.add('active');

  if (tabId === 'orders') {
    refreshOrders();
  } else if (tabId === 'refund') {
    loadRefunds();
  } else if (tabId === 'payment') {
    loadPaymentRecords();
  } else if (tabId === 'products') {
    loadProducts();
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.code === 0) {
      products = data.data;
      renderProducts();
      renderOrderItems();
    }
  } catch (e) {
    console.error('加载商品失败', e);
    showToast('加载商品失败', 'error');
  }
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = products.map(p => {
    const reservedQty = p._reservedQty || 0;
    return `
    <div class="product-card">
      <div class="product-name">${p.name}</div>
      <div class="product-desc">${p.description}</div>
      <div class="product-info">
        <span class="product-price">¥${p.price.toLocaleString()}</span>
        <span class="product-stock ${p.stock < 20 ? 'low' : ''}">可用: ${p.stock}</span>
      </div>
      <div class="product-actions-row">
        <button class="btn btn-primary" style="flex:1" onclick="addProductToOrder('${p.id}')">
          加入购物车
        </button>
        <button class="btn btn-info btn-small" onclick="showReservationDetail('${p.id}')">
          预占明细
        </button>
      </div>
    </div>
  `;
  }).join('');
}

async function showReservationDetail(productId) {
  try {
    const res = await fetch(`/api/products/${productId}/reservations`);
    const data = await res.json();
    if (data.code === 0) {
      const { summary, reservations } = data.data;
      const product = products.find(p => p.id === productId);
      const modal = document.getElementById('reservationModal');
      const body = document.getElementById('reservationModalBody');

      body.innerHTML = `
        <div class="reservation-summary">
          <h4>${product ? product.name : productId}</h4>
          <div class="reservation-summary-grid">
            <div class="reservation-stat">
              <span class="stat-value stat-active">${summary.activeQuantity}</span>
              <span class="stat-label">预占中(待付款)</span>
            </div>
            <div class="reservation-stat">
              <span class="stat-value stat-confirmed">${summary.confirmedQuantity}</span>
              <span class="stat-label">已确认(已成交)</span>
            </div>
            <div class="reservation-stat">
              <span class="stat-value stat-released">${summary.releasedQuantity}</span>
              <span class="stat-label">已释放(取消/超时)</span>
            </div>
          </div>
        </div>
        <div class="reservation-list">
          ${reservations.length === 0 ? '<p class="empty">暂无预占记录</p>' : reservations.map(r => `
            <div class="reservation-item">
              <div class="reservation-header-row">
                <span class="reservation-order" onclick="viewOrderDetail('${r.orderId}')" style="cursor:pointer;color:#667eea">订单 ${r.orderId.slice(0,8)}...</span>
                <span class="reservation-status ${r.status}">${reservationStatusMap[r.status]}</span>
              </div>
              <div class="reservation-detail">
                <span>数量: ${r.quantity}</span>
                <span>创建: ${formatDate(r.createdAt)}</span>
                ${r.status === 'ACTIVE' ? `<span>过期: ${formatDate(r.expiresAt)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      modal.style.display = 'flex';
    }
  } catch (e) {
    showToast('加载预占明细失败', 'error');
  }
}

function closeReservationModal() {
  document.getElementById('reservationModal').style.display = 'none';
}

function renderOrderItems() {
  const container = document.getElementById('orderItems');
  const items = products.filter(p => selectedQuantities[p.id] > 0);

  if (items.length === 0) {
    container.innerHTML = '<p class="empty">请选择商品</p>';
    updateTotalPrice();
    return;
  }

  container.innerHTML = items.map(p => `
    <div class="order-item">
      <div class="order-item-info">
        <div class="order-item-name">${p.name}</div>
        <div class="order-item-price">¥${p.price.toLocaleString()}</div>
      </div>
      <div class="quantity-control">
        <button class="quantity-btn" onclick="changeQuantity('${p.id}', -1)">-</button>
        <input type="number" class="quantity-input" value="${selectedQuantities[p.id]}"
               onchange="setQuantity('${p.id}', this.value)" min="1">
        <button class="quantity-btn" onclick="changeQuantity('${p.id}', 1)">+</button>
      </div>
    </div>
  `).join('');

  updateTotalPrice();
}

function addProductToOrder(productId) {
  if (!selectedQuantities[productId]) {
    selectedQuantities[productId] = 1;
  } else {
    selectedQuantities[productId]++;
  }
  renderOrderItems();
  switchTab('create-order');
  showToast('已添加到订单', 'success');
}

function changeQuantity(productId, delta) {
  const current = selectedQuantities[productId] || 0;
  const newValue = Math.max(0, current + delta);
  if (newValue === 0) {
    delete selectedQuantities[productId];
  } else {
    selectedQuantities[productId] = newValue;
  }
  renderOrderItems();
}

function setQuantity(productId, value) {
  const qty = parseInt(value) || 0;
  if (qty <= 0) {
    delete selectedQuantities[productId];
  } else {
    selectedQuantities[productId] = qty;
  }
  renderOrderItems();
}

function updateTotalPrice() {
  let total = 0;
  for (const productId in selectedQuantities) {
    const product = products.find(p => p.id === productId);
    if (product) {
      total += product.price * selectedQuantities[productId];
    }
  }
  document.getElementById('totalPrice').textContent = `¥${total.toLocaleString()}`;
}

async function createOrder() {
  const items = Object.entries(selectedQuantities).map(([productId, quantity]) => ({
    productId,
    quantity
  }));

  if (items.length === 0) {
    showToast('请先选择商品', 'error');
    return;
  }

  const orderData = {
    userId: document.getElementById('userId').value,
    items,
    shippingAddress: {
      name: document.getElementById('shipName').value,
      phone: document.getElementById('shipPhone').value,
      province: document.getElementById('shipProvince').value,
      city: document.getElementById('shipCity').value,
      district: document.getElementById('shipDistrict').value,
      detail: document.getElementById('shipDetail').value
    }
  };

  try {
    showToast('正在创建订单，预占库存中...', 'info');
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('订单创建成功，库存已预占！', 'success');
      selectedQuantities = {};
      renderOrderItems();
      viewOrderDetail(data.data.id);
      await loadProducts();
    } else {
      showToast(data.message || '创建失败', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('创建订单失败', 'error');
  }
}

async function refreshOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.code === 0) {
      orders = data.data;
      renderOrders();
    }
  } catch (e) {
    console.error('加载订单失败', e);
  }
}

function renderOrders() {
  const container = document.getElementById('orderList');

  if (orders.length === 0) {
    container.innerHTML = '<p class="empty">暂无订单</p>';
    return;
  }

  container.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <span class="order-no">订单号: ${order.orderNo}</span>
        <span class="order-status status-${order.status}">${statusMap[order.status]}</span>
      </div>
      <div class="order-info">
        <span>下单时间: ${formatDate(order.createdAt)}</span>
        <span>支付状态: ${paymentStatusMap[order.paymentStatus] || order.paymentStatus}</span>
        <span>商品数: ${order.items.length}件</span>
        <span class="order-amount">¥${order.totalAmount.toLocaleString()}</span>
      </div>
      <div class="order-items-summary">
        ${order.items.map(i => `${i.productName} x${i.quantity}`).join('、')}
      </div>
      <div class="order-actions">
        <button class="btn btn-info btn-small" onclick="viewOrderDetail('${order.id}')">查看详情</button>
        ${getOrderActions(order)}
      </div>
    </div>
  `).join('');
}

function getOrderActions(order) {
  let buttons = '';

  if (order.status === 'PENDING_PAYMENT') {
    buttons += `<button class="btn btn-success btn-small" onclick="payOrder('${order.id}')">去支付</button>`;
    buttons += `<button class="btn btn-danger btn-small" onclick="cancelOrder('${order.id}')">取消订单</button>`;
  }

  if (order.status === 'PENDING_SHIPMENT') {
    buttons += `<button class="btn btn-warning btn-small" onclick="shipOrder('${order.id}')">发货</button>`;
    buttons += `<button class="btn btn-danger btn-small" onclick="applyRefund('${order.id}')">申请退款</button>`;
  }

  if (order.status === 'SHIPPED') {
    buttons += `<button class="btn btn-success btn-small" onclick="confirmReceive('${order.id}')">确认收货</button>`;
    buttons += `<button class="btn btn-danger btn-small" onclick="applyRefund('${order.id}')">申请退款</button>`;
  }

  if (order.status === 'COMPLETED') {
    buttons += `<button class="btn btn-danger btn-small" onclick="applyRefund('${order.id}')">申请退款</button>`;
  }

  return buttons;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
}

async function viewOrderDetail(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    const data = await res.json();
    if (data.code === 0) {
      currentOrder = data.data;
      renderOrderDetail();
      switchTab('order-detail');
    }
  } catch (e) {
    showToast('加载订单详情失败', 'error');
  }
}

async function renderOrderDetail() {
  const container = document.getElementById('orderDetailContent');
  if (!currentOrder) {
    container.innerHTML = '<p class="empty">请从订单管理中选择一个订单查看详情</p>';
    return;
  }

  const order = currentOrder;

  let timelineHtml = '<p class="empty">加载中...</p>';
  try {
    const tlRes = await fetch(`/api/orders/${order.id}/timeline`);
    const tlData = await tlRes.json();
    if (tlData.code === 0 && tlData.data.length > 0) {
      timelineHtml = `<div class="order-timeline">${tlData.data.map((evt, idx) => `
        <div class="timeline-item ${idx === tlData.data.length - 1 ? 'latest' : ''}">
          <div class="timeline-dot ${getEventColor(evt.eventType)}"></div>
          <div class="timeline-content">
            <div class="timeline-header-row">
              <span class="timeline-event-type ${getEventColor(evt.eventType)}">${eventTypeMap[evt.eventType] || evt.eventType}</span>
              <span class="timeline-time">${formatDateTime(evt.createdAt)}</span>
            </div>
            <div class="timeline-desc">${evt.description}</div>
            <div class="timeline-operator">操作人: ${evt.operator}</div>
          </div>
        </div>
      `).join('')}</div>`;
    } else {
      timelineHtml = '<p class="empty">暂无时间线记录</p>';
    }
  } catch (e) {
    timelineHtml = '<p class="empty">加载时间线失败</p>';
  }

  container.innerHTML = `
    <div class="order-detail-card">
      <div class="detail-section">
        <h3>订单信息</h3>
        <div class="detail-row">
          <span class="detail-label">订单号</span>
          <span class="detail-value">${order.orderNo}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">订单状态</span>
          <span class="order-status status-${order.status}" style="font-size:14px">${statusMap[order.status]}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">支付状态</span>
          <span class="detail-value">${paymentStatusMap[order.paymentStatus] || order.paymentStatus}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">下单时间</span>
          <span class="detail-value">${formatDate(order.createdAt)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">订单金额</span>
          <span class="detail-value" style="color:#e74c3c;font-size:20px">¥${order.totalAmount.toLocaleString()}</span>
        </div>
        ${order.remark ? `<div class="detail-row"><span class="detail-label">备注</span><span class="detail-value">${order.remark}</span></div>` : ''}
      </div>

      <div class="detail-section">
        <h3>商品信息</h3>
        <div class="order-items-list">
          ${order.items.map(item => `
            <div class="order-item">
              <div class="order-item-info">
                <div class="order-item-name">${item.productName}</div>
                <div class="order-item-price">¥${item.price.toLocaleString()} x ${item.quantity}</div>
              </div>
              <div style="font-weight:bold;color:#e74c3c">¥${(item.price * item.quantity).toLocaleString()}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h3>收货地址</h3>
        <div class="detail-row">
          <span class="detail-label">收货人</span>
          <span class="detail-value">${order.shippingAddress.name}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">联系电话</span>
          <span class="detail-value">${order.shippingAddress.phone}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">地址</span>
          <span class="detail-value">${order.shippingAddress.province}${order.shippingAddress.city}${order.shippingAddress.district}${order.shippingAddress.detail}</span>
        </div>
      </div>

      ${order.trackingNumber ? `
        <div class="detail-section">
          <h3>物流信息</h3>
          <div class="detail-row">
            <span class="detail-label">快递公司</span>
            <span class="detail-value">${order.logisticsCompany || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">物流单号</span>
            <span class="detail-value">${order.trackingNumber}</span>
          </div>
          <div id="logisticsTraces">
            <p style="text-align:center;padding:20px;color:#999">
              <button class="btn btn-info btn-small" onclick="loadLogistics()">点击查看物流轨迹</button>
            </p>
          </div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h3>订单时间线</h3>
        ${timelineHtml}
      </div>

      <div class="detail-section">
        <h3>操作</h3>
        <div class="order-actions" style="padding-top:0">
          ${getOrderActions(order)}
        </div>
      </div>
    </div>
  `;
}

function getEventColor(eventType) {
  const colorMap = {
    'CREATED': 'blue',
    'PAYMENT_SUCCESS': 'green',
    'PAYMENT_FAILED': 'red',
    'SHIPPED': 'orange',
    'COMPLETED': 'green',
    'CANCELLED': 'gray',
    'AUTO_CLOSED': 'gray',
    'REFUND_APPLIED': 'orange',
    'REFUND_APPROVED': 'blue',
    'REFUND_REJECTED': 'red',
    'REFUND_COMPLETED': 'green',
    'STOCK_RESERVED': 'blue',
    'STOCK_RELEASED': 'gray',
    'STOCK_CONFIRMED': 'green',
  };
  return colorMap[eventType] || 'gray';
}

async function loadLogistics() {
  if (!currentOrder || !currentOrder.trackingNumber) return;

  try {
    const res = await fetch(`/api/logistics/track?trackingNumber=${currentOrder.trackingNumber}&company=${currentOrder.logisticsCompany || '顺丰速运'}`);
    const data = await res.json();

    if (data.code === 0) {
      const logistics = data.data;
      const container = document.getElementById('logisticsTraces');
      container.innerHTML = `
        <div class="logistics-timeline">
          ${logistics.traces.map(trace => `
            <div class="timeline-item">
              <div class="timeline-time">${trace.time}</div>
              <div class="timeline-status">${trace.status}</div>
              <div class="timeline-desc">${trace.description}</div>
              <div class="timeline-location">${trace.location}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    showToast('查询物流失败', 'error');
  }
}

async function payOrder(orderId) {
  try {
    showToast('正在创建支付...', 'info');
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, paymentMethod: 'alipay' })
    });
    const data = await res.json();

    if (data.code === 0) {
      const paymentId = data.data.paymentRecord.id;
      const confirmed = confirm('是否模拟支付成功？\n\n点击确定 = 支付成功\n点击取消 = 模拟失败');
      const success = confirmed;

      const payRes = await fetch('/api/payment/sandbox/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, success })
      });
      const payData = await payRes.json();

      if (payData.code === 0) {
        if (success) {
          showToast('支付成功！订单状态已更新', 'success');
        } else {
          showToast('支付失败', 'error');
        }
        await refreshOrders();
        if (currentOrder && currentOrder.id === orderId) {
          await viewOrderDetail(orderId);
        }
        await loadProducts();
      } else {
        showToast(payData.message || '支付失败', 'error');
      }
    } else {
      showToast(data.message || '创建支付失败', 'error');
    }
  } catch (e) {
    console.error(e);
    showToast('支付出错', 'error');
  }
}

async function cancelOrder(orderId) {
  if (!confirm('确定要取消该订单吗？取消后库存将被释放。')) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_001' })
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('订单已取消，库存已释放', 'success');
      await refreshOrders();
      if (currentOrder && currentOrder.id === orderId) {
        await viewOrderDetail(orderId);
      }
      await loadProducts();
    } else {
      showToast(data.message || '取消失败', 'error');
    }
  } catch (e) {
    showToast('取消订单失败', 'error');
  }
}

async function shipOrder(orderId) {
  const trackingNumber = prompt('请输入物流单号：', 'SF' + Math.floor(Math.random() * 10000000000));
  if (!trackingNumber) return;

  const company = prompt('请输入快递公司：', '顺丰速运');
  if (!company) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/ship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingNumber, logisticsCompany: company })
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('发货成功', 'success');
      await refreshOrders();
      if (currentOrder && currentOrder.id === orderId) {
        await viewOrderDetail(orderId);
      }
    } else {
      showToast(data.message || '发货失败', 'error');
    }
  } catch (e) {
    showToast('发货失败', 'error');
  }
}

async function confirmReceive(orderId) {
  if (!confirm('确认已收到货物？')) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user_001' })
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('确认收货成功', 'success');
      await refreshOrders();
      if (currentOrder && currentOrder.id === orderId) {
        await viewOrderDetail(orderId);
      }
    } else {
      showToast(data.message || '操作失败', 'error');
    }
  } catch (e) {
    showToast('操作失败', 'error');
  }
}

async function applyRefund(orderId) {
  const reason = prompt('请输入退款原因：', '商品不符合预期');
  if (!reason) return;

  try {
    const res = await fetch('/api/refund/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, userId: 'user_001', reason })
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('退款申请已提交，请等待商家审核', 'success');
      await refreshOrders();
      if (currentOrder && currentOrder.id === orderId) {
        await viewOrderDetail(orderId);
      }
      await loadRefunds();
    } else {
      showToast(data.message || '申请退款失败', 'error');
    }
  } catch (e) {
    showToast('申请退款失败', 'error');
  }
}

async function loadRefunds(statusFilter) {
  try {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/refund/list?${params.toString()}`);
    const data = await res.json();

    if (data.code === 0) {
      refunds = [];
      const refundData = data.data;
      for (const r of refundData) {
        const order = orders.find(o => o.id === r.orderId);
        refunds.push({
          ...r,
          orderNo: order ? order.orderNo : r.orderId,
          orderAmount: order ? order.totalAmount : r.amount,
          orderStatus: order ? order.status : '',
          paymentStatus: order ? order.paymentStatus : '',
        });
      }
      renderRefunds();
    }
  } catch (e) {
    console.error('加载退款记录失败', e);
  }
}

function filterRefunds(status) {
  currentRefundFilter = status;
  document.querySelectorAll('#refundFilterBar .filter-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('refundDetailPanel').style.display = 'none';
  loadRefunds(status);
}

function renderRefunds() {
  const container = document.getElementById('refundList');

  if (refunds.length === 0) {
    container.innerHTML = '<p class="empty">暂无退款记录</p>';
    return;
  }

  container.innerHTML = refunds.map(refund => `
    <div class="refund-card" onclick="showRefundDetail('${refund.id}')">
      <div class="refund-header">
        <span class="order-no">订单号: ${refund.orderNo}</span>
        <span class="refund-status ${refund.status}">${refundStatusMap[refund.status]}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">退款金额</span>
        <span class="detail-value" style="color:#e74c3c">¥${refund.amount.toLocaleString()}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">退款原因</span>
        <span class="detail-value">${refund.reason}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">申请时间</span>
        <span class="detail-value">${formatDate(refund.applyTime)}</span>
      </div>
      ${refund.status === 'PENDING' ? `
        <div class="order-actions" style="margin-top:12px" onclick="event.stopPropagation()">
          <button class="btn btn-success btn-small" onclick="approveRefund('${refund.id}')">同意退款</button>
          <button class="btn btn-danger btn-small" onclick="rejectRefund('${refund.id}')">拒绝退款</button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

async function showRefundDetail(refundId) {
  try {
    const res = await fetch(`/api/refund/${refundId}`);
    const data = await res.json();
    if (data.code !== 0) return;
    const r = data.data;

    const orderRes = await fetch(`/api/orders/${r.orderId}`);
    const orderData = await orderRes.json();
    const order = orderData.code === 0 ? orderData.data : null;

    const payRes = await fetch(`/api/payment/order/${r.orderId}`);
    const payData = await payRes.json();
    const payRecords = payData.code === 0 ? payData.data : [];

    const panel = document.getElementById('refundDetailPanel');
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="refund-detail-card">
        <div class="detail-section">
          <h3>退款详情</h3>
          <div class="detail-row"><span class="detail-label">退款单号</span><span class="detail-value">${r.id}</span></div>
          <div class="detail-row"><span class="detail-label">退款状态</span><span class="refund-status ${r.status}">${refundStatusMap[r.status]}</span></div>
          <div class="detail-row"><span class="detail-label">退款金额</span><span class="detail-value" style="color:#e74c3c">¥${r.amount.toLocaleString()}</span></div>
          <div class="detail-row"><span class="detail-label">退款原因</span><span class="detail-value">${r.reason}</span></div>
          <div class="detail-row"><span class="detail-label">申请时间</span><span class="detail-value">${formatDateTime(r.applyTime)}</span></div>
          ${r.approveTime ? `<div class="detail-row"><span class="detail-label">审批时间</span><span class="detail-value">${formatDateTime(r.approveTime)}</span></div>` : ''}
          ${r.refundTime ? `<div class="detail-row"><span class="detail-label">退款完成时间</span><span class="detail-value">${formatDateTime(r.refundTime)}</span></div>` : ''}
          ${r.transactionId ? `<div class="detail-row"><span class="detail-label">退款流水号</span><span class="detail-value">${r.transactionId}</span></div>` : ''}
        </div>
        ${order ? `
        <div class="detail-section">
          <h3>关联订单</h3>
          <div class="detail-row"><span class="detail-label">订单号</span><span class="detail-value" style="color:#667eea;cursor:pointer" onclick="viewOrderDetail('${order.id}')">${order.orderNo}</span></div>
          <div class="detail-row"><span class="detail-label">订单状态</span><span class="detail-value">${statusMap[order.status]}</span></div>
          <div class="detail-row"><span class="detail-label">订单金额</span><span class="detail-value">¥${order.totalAmount.toLocaleString()}</span></div>
          <div class="detail-row"><span class="detail-label">支付状态</span><span class="detail-value">${paymentStatusMap[order.paymentStatus]}</span></div>
        </div>
        ` : ''}
        ${payRecords.length > 0 ? `
        <div class="detail-section">
          <h3>关联支付记录</h3>
          ${payRecords.map(p => `
            <div class="detail-row"><span class="detail-label">支付单号</span><span class="detail-value">${p.id}</span></div>
            <div class="detail-row"><span class="detail-label">支付方式</span><span class="detail-value">${p.paymentMethod}</span></div>
            <div class="detail-row"><span class="detail-label">支付状态</span><span class="detail-value">${paymentStatusMap[p.status]}</span></div>
            ${p.paidAt ? `<div class="detail-row"><span class="detail-label">支付时间</span><span class="detail-value">${formatDateTime(p.paidAt)}</span></div>` : ''}
            ${p.transactionId ? `<div class="detail-row"><span class="detail-label">交易流水号</span><span class="detail-value">${p.transactionId}</span></div>` : ''}
          `).join('')}
        </div>
        ` : ''}
        <div class="detail-section">
          <h3>退款进度</h3>
          <div class="refund-progress">
            <div class="progress-step ${r.status !== 'PENDING' || true ? 'done' : ''}">
              <div class="progress-dot"></div>
              <span>申请提交</span>
            </div>
            <div class="progress-step ${(r.status === 'APPROVED' || r.status === 'PROCESSING' || r.status === 'COMPLETED') ? 'done' : ''} ${r.status === 'REJECTED' ? 'rejected' : ''}">
              <div class="progress-dot"></div>
              <span>${r.status === 'REJECTED' ? '已拒绝' : '商家审批'}</span>
            </div>
            <div class="progress-step ${(r.status === 'PROCESSING' || r.status === 'COMPLETED') ? 'done' : ''}">
              <div class="progress-dot"></div>
              <span>退款处理</span>
            </div>
            <div class="progress-step ${r.status === 'COMPLETED' ? 'done' : ''}">
              <div class="progress-dot"></div>
              <span>退款完成</span>
            </div>
          </div>
        </div>
        ${r.status === 'PENDING' ? `
        <div class="order-actions" style="margin-top:12px">
          <button class="btn btn-success btn-small" onclick="approveRefund('${r.id}')">同意退款</button>
          <button class="btn btn-danger btn-small" onclick="rejectRefund('${r.id}')">拒绝退款</button>
        </div>
        ` : ''}
      </div>
    `;
  } catch (e) {
    showToast('加载退款详情失败', 'error');
  }
}

async function approveRefund(refundId) {
  if (!confirm('确定同意该退款申请吗？')) return;

  try {
    const res = await fetch(`/api/refund/${refundId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('退款已审批，正在处理中...', 'success');
      await loadRefunds(currentRefundFilter);
      await refreshOrders();

      setTimeout(async () => {
        await loadRefunds(currentRefundFilter);
        await refreshOrders();
        showToast('退款已完成！', 'success');
      }, 3000);
    } else {
      showToast(data.message || '审批失败', 'error');
    }
  } catch (e) {
    showToast('审批失败', 'error');
  }
}

async function rejectRefund(refundId) {
  const reason = prompt('请输入拒绝原因：', '商品无问题');
  if (!reason) return;

  try {
    const res = await fetch(`/api/refund/${refundId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();

    if (data.code === 0) {
      showToast('已拒绝退款申请', 'success');
      await loadRefunds(currentRefundFilter);
      await refreshOrders();
    } else {
      showToast(data.message || '操作失败', 'error');
    }
  } catch (e) {
    showToast('操作失败', 'error');
  }
}

async function loadPaymentRecords() {
  try {
    const res = await fetch('/api/payment/records');
    const data = await res.json();
    if (data.code === 0) {
      paymentRecords = data.data;
      renderPaymentRecords();
    }
  } catch (e) {
    console.error('加载支付记录失败', e);
  }
}

function renderPaymentRecords() {
  const container = document.getElementById('paymentList');

  if (paymentRecords.length === 0) {
    container.innerHTML = '<p class="empty">暂无支付记录</p>';
    return;
  }

  container.innerHTML = paymentRecords.map(record => {
    const order = orders.find(o => o.id === record.orderId);
    const orderNo = order ? order.orderNo : record.orderId;
    return `
    <div class="payment-card" onclick="viewOrderDetail('${record.orderId}')">
      <div class="payment-header">
        <span class="payment-id">支付单号: ${record.id.slice(0,12)}...</span>
        <span class="payment-status ${record.status}">${paymentStatusMap[record.status]}</span>
      </div>
      <div class="payment-info-grid">
        <div class="payment-field">
          <span class="detail-label">关联订单</span>
          <span class="detail-value" style="color:#667eea">${orderNo}</span>
        </div>
        <div class="payment-field">
          <span class="detail-label">支付方式</span>
          <span class="detail-value">${record.paymentMethod}</span>
        </div>
        <div class="payment-field">
          <span class="detail-label">支付金额</span>
          <span class="detail-value" style="color:#e74c3c">¥${record.amount.toLocaleString()}</span>
        </div>
        <div class="payment-field">
          <span class="detail-label">创建时间</span>
          <span class="detail-value">${formatDateTime(record.createdAt)}</span>
        </div>
        ${record.transactionId ? `
        <div class="payment-field">
          <span class="detail-label">交易流水号</span>
          <span class="detail-value">${record.transactionId}</span>
        </div>
        ` : ''}
        ${record.paidAt ? `
        <div class="payment-field">
          <span class="detail-label">支付时间</span>
          <span class="detail-value">${formatDateTime(record.paidAt)}</span>
        </div>
        ` : ''}
      </div>
      ${record.status === 'REFUNDED' ? `
        <div class="payment-refund-badge">已退款</div>
      ` : ''}
      ${record.status === 'REFUNDING' ? `
        <div class="payment-refunding-badge">退款中</div>
      ` : ''}
    </div>
  `;
  }).join('');
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
