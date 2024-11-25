import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entity/user.entity';
import { CoursePositionEntity } from '../../coursePosition/entity/coursePosition.entity';

@Entity('scheduler_template')
export class SchedulerTemplateEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'scheduler_id' })
  id: number;

  @Column({ name: 'issynced', default: false })
  isSync: boolean;

  @Column({ name: 'is_main_template', default: false })
  isMain: boolean;

  @Column({ name: 'lastsynctime', default: null })
  lastSyncTime: Date;

  @OneToMany(
    () => CoursePositionEntity,
    (coursePositions) => coursePositions.scheduler,
  )
  coursePositions: CoursePositionEntity[];

  @ManyToOne(() => UserEntity, (user) => user.scheduler)
  user: UserEntity;
}
