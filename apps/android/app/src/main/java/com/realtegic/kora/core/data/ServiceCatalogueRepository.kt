package com.realtegic.kora.core.data

import com.realtegic.kora.core.model.AssignStaffServiceRequest
import com.realtegic.kora.core.model.BranchServiceDto
import com.realtegic.kora.core.model.CreateServiceCategoryRequest
import com.realtegic.kora.core.model.CreateServiceRequest
import com.realtegic.kora.core.model.ServiceCategoryDto
import com.realtegic.kora.core.model.ServiceDto
import com.realtegic.kora.core.model.StaffServiceAssignmentDto
import com.realtegic.kora.core.model.UpsertBranchServiceRequest
import com.realtegic.kora.core.network.ApiResult
import com.realtegic.kora.core.network.ServiceCatalogueApi
import com.realtegic.kora.core.network.safeApiCall
import com.realtegic.kora.core.network.safeUnitApiCall
import com.squareup.moshi.Moshi

/**
 * The client never invents a service id, computes an authoritative
 * effective price, or assumes a branch/service combination is valid --
 * every write here is a real server call, and archive/restore are the
 * only removal semantics offered, matching the backend's soft-delete
 * model (docs task "Service Catalogue Mobile Management").
 */
class ServiceCatalogueRepository(
    private val api: ServiceCatalogueApi,
    private val moshi: Moshi,
) {
    suspend fun listCategories(organizationId: String, includeArchived: Boolean = false): ApiResult<List<ServiceCategoryDto>> =
        safeApiCall(moshi) { api.listCategories(organizationId, includeArchived) }

    suspend fun createCategory(organizationId: String, request: CreateServiceCategoryRequest): ApiResult<ServiceCategoryDto> =
        safeApiCall(moshi) { api.createCategory(organizationId, request) }

    suspend fun archiveCategory(organizationId: String, categoryId: String): ApiResult<ServiceCategoryDto> =
        safeApiCall(moshi) { api.archiveCategory(organizationId, categoryId) }

    suspend fun listServices(
        organizationId: String,
        includeArchived: Boolean = false,
        serviceCategoryId: String? = null,
    ): ApiResult<List<ServiceDto>> = safeApiCall(moshi) { api.listServices(organizationId, includeArchived, serviceCategoryId) }

    suspend fun createService(organizationId: String, request: CreateServiceRequest): ApiResult<ServiceDto> =
        safeApiCall(moshi) { api.createService(organizationId, request) }

    suspend fun archiveService(organizationId: String, serviceId: String): ApiResult<ServiceDto> =
        safeApiCall(moshi) { api.archiveService(organizationId, serviceId) }

    suspend fun restoreService(organizationId: String, serviceId: String): ApiResult<ServiceDto> =
        safeApiCall(moshi) { api.restoreService(organizationId, serviceId) }

    suspend fun listBranchServices(organizationId: String, branchId: String): ApiResult<List<BranchServiceDto>> =
        safeApiCall(moshi) { api.listBranchServices(organizationId, branchId) }

    suspend fun upsertBranchService(
        organizationId: String,
        branchId: String,
        serviceId: String,
        request: UpsertBranchServiceRequest,
    ): ApiResult<BranchServiceDto> = safeApiCall(moshi) { api.upsertBranchService(organizationId, branchId, serviceId, request) }

    suspend fun listStaffAssignments(organizationId: String, branchId: String, serviceId: String): ApiResult<List<StaffServiceAssignmentDto>> =
        safeApiCall(moshi) { api.listStaffAssignments(organizationId, branchId, serviceId) }

    suspend fun assignStaff(
        organizationId: String,
        branchId: String,
        serviceId: String,
        request: AssignStaffServiceRequest,
    ): ApiResult<StaffServiceAssignmentDto> = safeApiCall(moshi) { api.assignStaff(organizationId, branchId, serviceId, request) }

    suspend fun unassignStaff(organizationId: String, branchId: String, serviceId: String, staffProfileId: String): ApiResult<Unit> =
        safeUnitApiCall(moshi) { api.unassignStaff(organizationId, branchId, serviceId, staffProfileId) }
}
