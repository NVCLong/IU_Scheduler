import {
  BaseEntity,
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserSettingInfo } from './user-info.entity';
import { SchedulerTemplateEntity } from '../../schedulerTemplate/schedulerTemplate.entity';

@Entity('student_users')
export class UserEntity extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ name: 'student_id' })
  studentID: string;

  @OneToOne(
    () => UserSettingInfo,
    (userSettingInfo: UserSettingInfo) => userSettingInfo.user,
  )
  userSettingInfo: UserSettingInfo;

  @OneToOne(() => SchedulerTemplateEntity, (scheduleTemplate: SchedulerTemplateEntity) => scheduleTemplate.user)
  scheduleTemplate: SchedulerTemplateEntity;
}
