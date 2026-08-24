"""Re-exports every model so Base.metadata is fully populated for Alembic autogenerate."""
from core.models.base import Base, new_id
from core.models.reference import AiPrompt, City, Configuration, Country, Role
from core.models.identity import AdminUser, AuditLog, Customer, CustomerSession, OtpChallenge
from core.models.addresses import CustomerAddress, RecentAddressSearch
from core.models.mart import (
    AiExecution,
    Cart,
    CartItem,
    MartCategory,
    MartOffer,
    MartProduct,
    MartStore,
    MartSubcategory,
    Order,
    OrderItem,
    RewardEntry,
    SupportTicket,
)
from core.models.express import (
    ExpressBooking,
    ExpressBookingItem,
    ExpressBookingTimeline,
    ExpressDeliveryPref,
    ExpressMoversCategory,
    ExpressMoversItem,
    ExpressMoversPricing,
    ExpressMoveType,
    ExpressPackageType,
    ExpressPricingRule,
    ExpressPromo,
    ExpressTimeSlot,
    ExpressVehicle,
    ExpressWeightTier,
    ModuleDriver,
)
from core.models.vendors import ModuleVendor, VendorDocument
from core.models.partners import (
    APPLICATION_STATUSES, Partner, PartnerApplication, Warehouse,
    WarehouseAisle, WarehouseBin, WarehouseCategoryDefault, WarehouseRack,
    WarehouseShelf, WarehouseZone,
    WAREHOUSE_STATUSES, WAREHOUSE_STATUS_OPERATIONAL, WAREHOUSE_STATUS_MANAGEABLE,
)
from core.models.partner_commerce import (
    PARTNER_ORDER_STATUSES, PARTNER_WALLET_TX_KINDS,
    PartnerOrder, PartnerOrderPick, PartnerProduct, PartnerWallet, PartnerWalletTxn,
)
from core.models.partner_staff import (
    PARTNER_STAFF_ROLES, PartnerStaff, PartnerStaffAuditLog,
    PartnerStaffStoreAssignment,
)
from core.models.catalog_inventory import (
    PARTNER_PRODUCT_APPROVAL_STATUSES, STOCK_MOVEMENT_KINDS,
    MartBrand, PartnerInventory, PartnerProductLocation, PartnerStockMovement,
)
from core.models.inventory_ops import (
    RECEIPT_STATUSES, RECEIPT_SOURCES, COUNT_STATUSES, COUNT_SCOPES,
    PartnerReceipt, PartnerReceiptItem,
    PartnerStockCount, PartnerStockCountLine,
)
from core.models.replenishment import (
    REPLENISHMENT_STATUSES, REPLENISHMENT_SOURCES, PartnerReplenishment,
)
from core.models.transfers import (
    TRANSFER_STATUSES, PartnerTransfer, PartnerTransferItem,
)
from core.models.driver import (
    DRIVER_STATUSES, KYC_STEPS, VEHICLE_TYPES, JOB_STATUSES,
    EARNING_KINDS, WITHDRAWAL_STATUSES, MESSAGE_SENDERS,
    Driver, DriverJob, DriverOtp, DriverEarning, DriverWithdrawal, DriverJobMessage,
)
from core.models.suppliers import (
    SUPPLIER_STATUSES, SUPPLIER_APPLICATION_STATUSES, SUPPLIER_BUSINESS_TYPES,
    SUPPLIER_CONTACT_RELATIONS, SUPPLIER_DOCUMENT_TYPES,
    Supplier, SupplierApplication, SupplierContact, SupplierDocument,
    SupplierSupplyLocation, SupplierCategoryInterest, SupplierBankInfo,
    SupplierReviewAudit, SupplierProduct, SupplierProductRequest,
)
from core.models.purchase_orders import (
    PO_STATUSES, PO_ACTOR_KINDS,
    PurchaseOrder, PurchaseOrderLine, PurchaseOrderReceipt,
    PurchaseOrderReceiptLine, PurchaseOrderAudit,
)
from core.models.supplier_invoices import (
    INVOICE_STATUSES, LINE_MATCH_STATUSES,
    SupplierInvoice, SupplierInvoiceLine, SupplierInvoiceAudit,
)
from core.models.notifications import RECIPIENT_KINDS, Notification

__all__ = [
    "Base",
    "new_id",
    "AiPrompt",
    "City",
    "Configuration",
    "Country",
    "Role",
    "AdminUser",
    "AuditLog",
    "Customer",
    "CustomerSession",
    "OtpChallenge",
    "CustomerAddress",
    "RecentAddressSearch",
    "AiExecution",
    "Cart",
    "CartItem",
    "MartCategory",
    "MartOffer",
    "MartProduct",
    "MartStore",
    "MartSubcategory",
    "Order",
    "OrderItem",
    "RewardEntry",
    "SupportTicket",
    "ExpressBooking",
    "ExpressBookingItem",
    "ExpressBookingTimeline",
    "ExpressDeliveryPref",
    "ExpressMoversCategory",
    "ExpressMoversItem",
    "ExpressMoversPricing",
    "ExpressMoveType",
    "ExpressPackageType",
    "ExpressPricingRule",
    "ExpressPromo",
    "ExpressTimeSlot",
    "ExpressVehicle",
    "ExpressWeightTier",
    "ModuleDriver",
    "ModuleVendor",
    "VendorDocument",
    "PartnerApplication",
    "Partner",
    "Warehouse",
    "APPLICATION_STATUSES",
    "WarehouseZone",
    "WarehouseAisle",
    "WarehouseRack",
    "WarehouseShelf",
    "WarehouseBin",
    "WarehouseCategoryDefault",
    "PartnerProduct",
    "PartnerOrder",
    "PartnerOrderPick",
    "PartnerWallet",
    "PartnerWalletTxn",
    "PartnerStaff",
    "PartnerStaffAuditLog",
    "PartnerStaffStoreAssignment",
    "PARTNER_ORDER_STATUSES",
    "PARTNER_WALLET_TX_KINDS",
    "PARTNER_STAFF_ROLES",
    "WAREHOUSE_STATUSES",
    "WAREHOUSE_STATUS_OPERATIONAL",
    "WAREHOUSE_STATUS_MANAGEABLE",
    "MartBrand",
    "PartnerInventory",
    "PartnerProductLocation",
    "PartnerStockMovement",
    "PARTNER_PRODUCT_APPROVAL_STATUSES",
    "STOCK_MOVEMENT_KINDS",
    "PartnerReceipt", "PartnerReceiptItem",
    "PartnerStockCount", "PartnerStockCountLine",
    "RECEIPT_STATUSES", "RECEIPT_SOURCES", "COUNT_STATUSES", "COUNT_SCOPES",
    "PartnerReplenishment", "REPLENISHMENT_STATUSES", "REPLENISHMENT_SOURCES",
    "PartnerTransfer", "PartnerTransferItem", "TRANSFER_STATUSES",
    "Supplier", "SupplierApplication", "SupplierContact", "SupplierDocument",
    "SupplierSupplyLocation", "SupplierCategoryInterest", "SupplierBankInfo",
    "SupplierReviewAudit", "SupplierProduct", "SupplierProductRequest",
    "PO_STATUSES", "PO_ACTOR_KINDS",
    "PurchaseOrder", "PurchaseOrderLine", "PurchaseOrderReceipt",
    "PurchaseOrderReceiptLine", "PurchaseOrderAudit",
    "INVOICE_STATUSES", "LINE_MATCH_STATUSES",
    "SupplierInvoice", "SupplierInvoiceLine", "SupplierInvoiceAudit",
    "RECIPIENT_KINDS", "Notification",
    "SUPPLIER_STATUSES", "SUPPLIER_APPLICATION_STATUSES",
    "SUPPLIER_BUSINESS_TYPES", "SUPPLIER_CONTACT_RELATIONS",
    "SUPPLIER_DOCUMENT_TYPES",
    "Driver", "DriverJob", "DriverOtp", "DriverEarning", "DriverWithdrawal", "DriverJobMessage",
    "EARNING_KINDS", "WITHDRAWAL_STATUSES", "MESSAGE_SENDERS",
    "DRIVER_STATUSES", "KYC_STEPS", "VEHICLE_TYPES", "JOB_STATUSES",
]
