package egovframework.backoffice.account;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AdminUserMapper {
    AdminUser findById(@Param("id") Long id);

    AdminUser findByLoginId(@Param("loginId") String loginId);

    List<AdminUser> findAll();

    long count();

    long countActiveByRole(@Param("role") AdminRole role);

    int insert(AdminUser user);

    int updateProfile(AdminUser user);

    int updatePassword(@Param("id") Long id, @Param("passwordHash") String passwordHash,
                       @Param("mustChangePw") boolean mustChangePw);

    int updateLastLogin(@Param("id") Long id);
}
